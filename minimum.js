(function () {
    let map = initContainer("mapContainer", 1);
    let timeLine = initContainer("timeLineContainer", 0.15);
    let margin = {top: 20, right: 20, bottom: 20, left: 50};
    let zoomFactor = map.width * 80;
    let centerCoordsNYC = [-74.00, 40.7];
    let parseTime = d3.timeParse("%m/%d/%Y");

    //Define map projection
    map.projection = d3.geoMercator()
        .translate([map.width / 2, map.height / 2])
        .center(centerCoordsNYC)
        .scale(zoomFactor);

    let color = d3.scaleOrdinal()
        .range(["#91a1bd", "#817c9c", "#6f5c7d", "#5f3e5f", "#92514b"]);

    //Define path generator
    let path = d3.geoPath()
        .projection(map.projection);

    //Create SVG element
    timeLine.svg = timeLine.container
        .append("svg")
        .attr("width", timeLine.width)
        .attr("height", timeLine.height);

    //Create SVG element
    map.svg = map.container
        .append("svg")
        .attr("width", map.width)
        .attr("height", map.height)
        .attr("id", "timeLineSVG");

    //Load in GeoJSON data
    d3.json("boroughs.geojson", function (json) {
        d3.csv("all_murder.csv", rowConverter, function (data) {
            //group murders by day
            timeLine.groupedByDate = d3.nest()
                .key(d => d.complaintDate)
                .entries(data)
                .sort((a, b) => d3.ascending(parseTime(a.key), parseTime(b.key)));

            fillMissingDates(timeLine.groupedByDate);

            map.svg.selectAll("path")
                .data(json.features)
                .enter()
                .append("path")
                .attr("d", path)
                .style("fill", d => color(d.id));

            //Create one label per state
            map.svg.selectAll("text")
                .data(json.features)
                .enter()
                .append("text")
                .attr("class", "map-label")
                .attr("x", d => path.centroid(d)[0])
                .attr("y", d => path.centroid(d)[1])
                .text(d => d.properties["BoroName"]);

            map.svg.selectAll("g")
                .data(timeLine.groupedByDate)
                .enter()
                .append("g")
                .attr("id", d => "_" + d.key.replace(/\//g, "-"))
                .selectAll("circle")
                .data(d => d.values)
                .enter()
                .append("circle")
                .attr("cx", d => map.projection([d.longitude, d.latitude])[0])
                .attr("cy", d => map.projection([d.longitude, d.latitude])[1])
                .attr("r", "3")
                .attr("class","non-brushed")
                .style("display", "none");

            timeLine.xScale = d3.scaleTime()
                .domain([parseTime(d3.min(data, d => d.complaintDate)), parseTime(d3.max(data, d => d.complaintDate))])
                .range([margin.left, timeLine.width - margin.right])
                .nice();
            timeLine.yScale = d3.scaleLinear()
                .domain([d3.min(timeLine.groupedByDate, d => d.values.length), d3.max(timeLine.groupedByDate, d => d.values.length)])
                .range([timeLine.height - margin.top - margin.bottom, margin.top]);

            timeLine.xAxis = d3.axisBottom(timeLine.xScale).ticks(10);
            timeLine.yAxis = d3.axisLeft(timeLine.yScale);

            //Create axes
            timeLine.svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + (timeLine.height - margin.bottom - margin.top) + ")")
                .call(timeLine.xAxis);

            timeLine.svg.append("g")
                .attr("class", "y axis")
                .attr("transform", "translate(" + margin.left + ",0)")
                .call(timeLine.yAxis);

            //Y-axis label
            timeLine.svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", margin.left/2)
                .attr("x",0 - (timeLine.height-margin.top)/2)
                .attr("class", "axis-label")
                .text("# of Murders");

            let line = d3.line()
                .x(d => timeLine.xScale(parseTime(d.key)))
                .y(d => timeLine.yScale(d.values.length))
                .curve(d3.curveStep);

            timeLine.svg.append("path")
                .datum(timeLine.groupedByDate)
                .attr("class", "tl-line")
                .attr("d", line);

            timeLine.brush = d3.brushX()
                .extent([[margin.left, margin.top], [timeLine.width - margin.right, timeLine.height - (margin.bottom + margin.top)]])
                .on("brush", brushed);

            timeLine.brushArea = timeLine.svg.append("g")
                .attr("class", "x brush")
                //.attr("opacity", 0)
                .call(timeLine.brush);
                //.call(timeLine.brush.move, [margin.left, (timeLine.width - margin.right) / 3]);

            timeLine.filteredData = timeLine.groupedByDate.map(d => d.key);
            updateDots([],timeLine.filteredData);

            d3.select("body").classed("overflow-hidden", false).select(".overlay").remove();
        });
    });
    function calcWidth(container) {
        return parseInt(container.style("width")) -
            (parseInt(container.style("padding-left")) + parseInt(container.style("padding-right")));
    }
    function initContainer(id, ratio = 1) {
        let container = d3.select("#" + id);
        let width = calcWidth(container);
        return {
            container: container,
            width: width,
            height: Math.max(~~(width * ratio), 160)
        }
    }
    function rowConverter(d) {
        return {
            index: d["Index"],
            borough: d["BORO_NM"],
            complaintDate: d["RPT_DT"],
            complaintTime: d["CMPLNT_FR_TM"],
            longitude: d["Longitude"],
            latitude: d["Latitude"]
        };
    }
    function brushed() {
        let selection = d3.event.selection.map(timeLine.xScale.invert);
        timeLine.currentBrush = d3.event.selection;
        const filteredBySelection = timeLine.groupedByDate.map(d => d.key).filter(d => {
            let date = parseTime(d);
            return date >= selection[0] && date <= selection[1];
        });
        if (!timeLine.filteredData) {
            timeLine.filteredData = filteredBySelection;
            updateDots([],filteredBySelection);
            return;
        }
        const keysToAdd = filteredBySelection.filter(d => timeLine.filteredData.indexOf(d) === -1);
        const keysToDelete = timeLine.filteredData.filter(d => filteredBySelection.indexOf(d) === -1);
        timeLine.filteredData = filteredBySelection;
        updateDots(keysToDelete, keysToAdd);
    }
    function updateDots(keysToDelete, keysToAdd) {
        setDotsVisibility(keysToDelete, false);
        setDotsVisibility(keysToAdd, true);
    }
    function setDotsVisibility(keys, isVisible) {
        for (let key of keys) {d3.select("#_" + key.replace(/\//g, "-")).classed("visible", isVisible)}
    }

    function dateToString(date){
        return ("0" + (date.getMonth()+1)).slice(-2) +"/"
            + ("0" + date.getDate()).slice(-2) + "/"
            + date.getFullYear();
    }

    function fillMissingDates(dates) {
        let i = 0;
        let currentDay = 0;
        let nextDay = 0;
        let differenceInMilliSeconds = 0;
        let dayLengthInMilliSeconds = 86400000;
        while(i < dates.length-1){
            if(i >= dates.length){
                break;
            }
            currentDay = parseTime(dates[i].key);
            nextDay = parseTime(dates[i+1].key);
            differenceInMilliSeconds = nextDay - currentDay;
            if( differenceInMilliSeconds > dayLengthInMilliSeconds){
                let missingDay = new Date(currentDay);
                missingDay.setDate((currentDay.getDate()+1));
                //insert missing day between current and next
                dates.splice(i+1,0,{key : dateToString(missingDay), values:[]});
            }
            i++;
        }
    }
})();