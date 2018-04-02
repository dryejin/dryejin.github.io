(function () {
    Number.prototype.clamp = function (min, max) {
        return Math.min(Math.max(this, min), max);
    };
    let map = initContainer("mapContainer", 0.6);
    let timeLine = initContainer("timeLineContainer", 0.15, {top: 20, right: 20, bottom: 20, left: 50});
    let barChart = initContainer("barChartContainer", 0.6, {top: 10, right: 0, bottom: 40, left: 50});
    let zoomFactor = map.height * 100;
    let centerCoordsNYC = [-74.00, 40.7];
    let baseDuration = 100;
    let parseTime = d3.timeParse("%m/%d/%Y");
    let isRunning = false;
    let playButtonSymbol = {PLAY: 0, PAUSE: 1, 0: "PLAY", 1: "PAUSE"};

    // compare to string because localstorage returns strings
    let showDarkTheme = localStorage.getItem("show-dark-theme") === "true";
    d3.select("body").classed("dark-theme", showDarkTheme);
    d3.select("#themeToggle").property("checked", showDarkTheme);

    function updateFilteredComponents() {
        map.update();
        timeLine.update();
        barChart.update();
    }

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

    barChart.svg = barChart.container
        .append("svg")
        .attr("width", barChart.width)
        .attr("height", barChart.height)
        .attr("id", "barChartSVG");

    //Load in GeoJSON data
    d3.json("boroughs.geojson", function (json) {
        d3.csv("all_murder.csv", rowConverter, function (data) {

            const initCrossfilter = (filter) => {
                let
                    borough = filter.dimension(function (d) {
                        return d.borough
                    }),
                    boroughs = borough.group(),

                    complaintTime = filter.dimension(function (d) {
                        return +d.complaintTime
                    }),
                    complaintTimes = complaintTime.group(),

                    complaintDate = filter.dimension(function (d) {
                        return parseTime(d.complaintDate)
                    }),
                    complaintDates = complaintDate.group(),

                    latitude = filter.dimension(function (d) {
                        return +d.latitude
                    }),
                    latitudes = latitude.group(),

                    longitude = filter.dimension(function (d) {
                        return +d.longitude
                    }),
                    longitudes = longitude.group();

                return {
                    filter: filter,
                    all: filter.groupAll(),
                    borough: borough,
                    boroughs: boroughs,
                    complaintTime: complaintTime,
                    complaintTimes: complaintTimes,
                    complaintDate: complaintDate,
                    complaintDates: complaintDates,
                    latitude: latitude,
                    latitudes: latitudes,
                    longitude: longitude,
                    longitudes: longitudes
                }
            };
            const cf_init = crossfilter().add(data);
            const cf = initCrossfilter(cf_init);
            timeLine.cf = cf; // TODO: Try passing as parameter to init instead
            map.cf = cf;
            barChart.cf = cf;
            //group murders by day

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

            map.pointGroup = map.svg.append("g");

            map.brush = d3.brush()
            /*.on("start", () => {
                // Clear filters
                console.log("CLREARAR")
                map.cf.latitude.filterAll();
                map.cf.longitude.filterAll();

                updateFilteredComponents();
            })*/
                .on("brush", mapBrushed);


            map.brushArea = map.svg.append("g")
                .call(map.brush);

            timeLine.xScale = d3.scaleTime()
                .domain([parseTime(d3.min(data, d => d.complaintDate)), parseTime(d3.max(data, d => d.complaintDate))])
                .range([timeLine.margin.left, timeLine.width - timeLine.margin.right])
                .nice();

            timeLine.yScale = d3.scaleLinear()
                .domain([0, 1])
                .range([timeLine.height - timeLine.margin.top - timeLine.margin.bottom, timeLine.margin.top]);

            timeLine.xAxis = d3.axisBottom(timeLine.xScale).ticks(10);
            timeLine.yAxis = d3.axisLeft(timeLine.yScale);

            timeLine.brush = d3.brushX()
                .extent([[timeLine.margin.left, timeLine.margin.top], [timeLine.width - timeLine.margin.right, timeLine.height - timeLine.margin.bottom - timeLine.margin.top]])
                .on("brush", timeLineBrushed);


            // Create path
            timeLine.svg.append("path")
                .attr("class", "tl-line");

            timeLine.brushArea = timeLine.svg.append("g")
                .attr("class", "x brush")
                .call(timeLine.brush);

            //Create axes
            timeLine.svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + (timeLine.height - timeLine.margin.bottom - timeLine.margin.top) + ")")
                .call(timeLine.xAxis);

            timeLine.svg.append("g")
                .attr("class", "y axis")
                .attr("transform", "translate(" + timeLine.margin.left + ",0)")
                .call(timeLine.yAxis);

            //Y-axis label
            timeLine.svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", timeLine.margin.left / 2)
                .attr("x", 0 - (timeLine.height - timeLine.margin.top) / 2)
                .attr("class", "axis-label")
                .text("# of Murders");

            timeLine.playButton = d3.select("#playButton")
                .on("click", playTimeLine);


            barChart.xScale = d3.scaleBand()
                .range([barChart.margin.left, barChart.width - barChart.margin.right])
                .padding(0.05)
                .paddingOuter(0.5)
                .domain(d3.range(24));

            barChart.yScale = d3.scaleLinear()
                .range([barChart.height - barChart.margin.bottom - barChart.margin.top, barChart.margin.top]);

            // Scale the range of the data in the domains
            barChart.yScale.domain([0, 120]);

            barChart.xAxis = d3.axisBottom(barChart.xScale);

            //Define Y axis
            barChart.yAxis = d3.axisLeft(barChart.yScale);

            // append the rectangles for the bar chart
            barChart.svg.selectAll(".bar")
                .data(d3.range(0, 24, 1))
                .enter().append("rect")
                .attr("class", "bar");

            //Create axes
            barChart.svg.append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(0," + (barChart.height - barChart.margin.bottom - barChart.margin.top) + ")")
                .call(barChart.xAxis);

            barChart.svg.append("g")
                .attr("class", "y axis")
                .attr("transform", "translate(" + barChart.margin.left + ",0)")
                .call(barChart.yAxis);

            //x-axis label
            barChart.svg.append("text")
                .attr("x", (barChart.width + barChart.margin.left) / 2)
                .attr("y", barChart.height - 9)
                .attr("class", "axis-label")
                .text("Hours");

            //Y-axis label
            barChart.svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("y", barChart.margin.left / 2 - 7)
                .attr("x", 0 - (barChart.height - barChart.margin.bottom - barChart.margin.top) / 2)
                .attr("class", "axis-label")
                .text("# of Murders");

            //Set inital bar y value
            barChart.svg.selectAll(".bar")
                .attr("y", barChart.height - barChart.margin.bottom - barChart.margin.top);

            barChart.brush = d3.brushX()
                .extent([[barChart.margin.left, barChart.margin.top], [barChart.width - barChart.margin.right, barChart.height - barChart.margin.bottom - barChart.margin.top]])
                .on("brush", barChartBrushed);

            barChart.brushArea = barChart.svg.append("g")
                .attr("class", "x brush")
                .call(barChart.brush);
            //.call(barChart.brush.move, [barChart.margin.left, (barChart.width - barChart.margin.right)])
            d3.select("#themeToggle").on("change", setTheme);

            //Initial brush value for timeline, also calls update on all dependent components
            //uncomment for initial timeline selection
            //timeLine.brushArea.call(timeLine.brush.move, [timeLine.margin.left, (timeLine.width - timeLine.margin.right) / 3]);
            //comment out when using initial selection
            updateFilteredComponents();

            // Remove loading overlay after everything is initialized
            d3.select("body").classed("overflow-hidden", false).select(".overlay").remove();
        });
    });

    function setTheme() {
        const isChecked = d3.select(this).property("checked");
        localStorage.setItem("show-dark-theme", isChecked);
        d3.select("body").classed("dark-theme", isChecked);
    }

    timeLine.update = function () {

        const currentData = timeLine.cf.complaintDates.all();
        const dataMax = d3.max(currentData, d => d.value);
        const dataMin = d3.min(currentData, d => d.value);
        timeLine.yScale.domain([dataMin, dataMax]).nice(dataMax);

        timeLine.yAxis = d3.axisLeft(timeLine.yScale).ticks(dataMax);

        let line = d3.line()
            .x(d => timeLine.xScale(d.key))
            .y(d => timeLine.yScale(d.value))
            .curve(d3.curveStep);

        timeLine.svg.select(".tl-line")
            .datum(currentData)
            .attr("d", line);

        timeLine.svg.select(".y.axis")
            .transition().duration(50)
            .attr("transform", "translate(" + timeLine.margin.left + ",0)")
            .call(timeLine.yAxis);
    };

    function playTimeLine() {
        if (!isRunning) {
            isRunning = true;
            setPlayButtonSymbol(playButtonSymbol.PAUSE);
            let brushStart = timeLine.xScale(parseTime("01/01/2006"));
            let brushEnd = timeLine.xScale(parseTime("12/31/2006"));
            if(timeLine.currentBrush){
                const brushCoords = timeLine.currentBrush;
                const brushWidth = brushCoords[1] - brushCoords[0];
                const yearWidth = brushEnd - brushStart;
                if (brushCoords[1] < timeLine.width - timeLine.margin.right && brushWidth <= yearWidth + 5) {
                    brushStart = brushCoords[0];
                    brushEnd = brushCoords[1];
                }
            } else {
                moveBrush(brushStart, brushEnd);
            }
            timeLine.interval = setInterval(() => {
                moveBrush(brushStart += 1, brushEnd += 1);
                if (brushEnd >= timeLine.width - timeLine.margin.right) {
                    isRunning = false;
                    setPlayButtonSymbol(playButtonSymbol.PLAY);
                    clearInterval(timeLine.interval);
                }
            }, 10);
        } else {
            isRunning = false;
            setPlayButtonSymbol(playButtonSymbol.PLAY);
            clearInterval(timeLine.interval);
        }
    }

    function moveBrush(start, end) {
        timeLine.brushArea
            .call(timeLine.brush.move, [start, end]);
    }

    function calcWidth(container) {
        return parseInt(container.style("width")) -
            (parseInt(container.style("padding-left")) + parseInt(container.style("padding-right")));
    }

    function initContainer(id, ratio = 1, margin = {top: 0, right: 0, bottom: 0, left: 0}) {
        let container = d3.select("#" + id);
        let width = calcWidth(container);
        return {
            container: container,
            width: width,
            height: Math.max(~~(width * ratio), 160),
            margin: margin
        }
    }

    function rowConverter(d) {
        return {
            index: d["Index"],
            borough: d["BORO_NM"],
            complaintDate: d["RPT_DT"],
            complaintTime: d["CMPLNT_FR_TM"],
            longitude: +d["Longitude"],
            latitude: +d["Latitude"]
        };
    }

    function timeLineBrushed() {
        //Stop animation when brush area is moved by user
        const event = d3.event.sourceEvent;

        if (event !== null && event.type === "mousemove") {
            setPlayButtonSymbol(playButtonSymbol.PLAY);
            isRunning = false;
            clearInterval(timeLine.interval);
        }
        let selection = d3.event.selection.map(timeLine.xScale.invert);
        timeLine.currentBrush = d3.event.selection;
        map.cf.complaintDate.filterRange([selection[0], selection[1]]);

        updateFilteredComponents();
    }

    map.update = function () {
        map.dots = map.pointGroup
            .selectAll("circle").data(map.cf.filter.allFiltered());

        map.dots
            .attr("cx", d => map.projection([d.longitude, d.latitude])[0])
            .attr("cy", d => map.projection([d.longitude, d.latitude])[1]);

        map.dots
            .enter()
            .append("circle")
            .attr("cx", d => map.projection([d.longitude, d.latitude])[0])
            .attr("cy", d => map.projection([d.longitude, d.latitude])[1])
            .attr("r", 3)
            .attr("class", "non-brushed");

        map.dots.exit().remove();
    };

    function setPlayButtonSymbol(symbol) {
        let icon = d3.select("#buttonIcon");
        icon.classed("play", playButtonSymbol.PLAY === symbol);
        icon.classed("pause", playButtonSymbol.PAUSE === symbol);
    }

    function scaleBandInvert(scale, value, marginLeft) {
        const adjustedValue = value - marginLeft - (scale.paddingOuter() * scale.step());
        const stepCount = Math.floor(adjustedValue / scale.step());
        return stepCount;
    }

    function barChartBrushed() {
        let selection = d3.event.selection;
        let selectionStart = scaleBandInvert(barChart.xScale, selection[0], barChart.margin.left).clamp(0, 23); // TODO: Get theses values from scale domain
        let selectionEnd = scaleBandInvert(barChart.xScale, selection[1], barChart.margin.left).clamp(0, 23); // TODO: Get theses values from scale domain
        barChart.cf.complaintTime.filterRange([
            selectionStart,
            selectionEnd + 1 // Range end is exclusive
        ]);
        updateFilteredComponents();
    }

    barChart.update = function () {

        const currentData = barChart.cf.complaintTimes.all();
        let maxValue = d3.max(currentData, d => d.value);
        /*
        16 uses mostly 2 step ticks while 10 tries to use 5 step ticks. 5 stepticks look a little ugly because
        the axis is sometimes forced to 2 anyways to make it nice
         */
        barChart.yScale.domain([0, maxValue]).nice(maxValue < 16 ? maxValue : 16);
        barChart.yAxis = d3.axisLeft(barChart.yScale).ticks(maxValue < 16 ? maxValue : 16);

        barChart.svg.select(".y.axis")
            .transition()
            .duration(50)
            .call(barChart.yAxis);

        barChart.svg.selectAll(".bar")
            .data(currentData)
            .attr("x", function (d) {
                return barChart.xScale(d.key);
            })
            .attr("width", barChart.xScale.bandwidth())
            .transition().duration(50)
            //.ease(d3.easeExp)
            .attr("y", function (d) {
                return barChart.yScale(d.value);
            })
            .attr("height", function (d) {
                return barChart.height - barChart.margin.bottom - barChart.margin.top - barChart.yScale(d.value);
            });
    };

    function mapBrushed() {
        const coords = d3.event.selection;
        const p1 = map.projection.invert([coords[0][0], coords[0][1]]);
        const p2 = map.projection.invert([coords[1][0], coords[1][1]]);

        const minLongitude = p1[0];
        const maxLongitude = p2[0];

        const minLatitude = p2[1];
        const maxLatitude = p1[1];

        map.cf.latitude.filterRange([minLatitude, maxLatitude]);
        map.cf.longitude.filterRange([minLongitude, maxLongitude]);

        updateFilteredComponents();
    }
})();