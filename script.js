var hashtagPlot = document.getElementById('hashtag-plot');
var scrubBar    = document.getElementById('scrub-bar');
var SOTUvideo   = document.getElementById('sotu-video');
var videoOffset = 306;

// Initialize these for loading later, after window.onload
var nation = null;
var statePaths = null;
var stateAbbreviations = null;

// Pull out all the transcript timestamps for use throughout
var transcript = document.getElementById('sotu-transcript');
var timestamps = extractTimestamps();
function extractTimestamps() {
	var timestamps = [];
	var stampedDivs = transcript.querySelectorAll('div');
	for (var i = 0; i < stampedDivs.length; i++) {
		timestamps[i] = parseInt(stampedDivs[i].id.split('-')[2], 10);
	}
	return timestamps;
}

// for each timestamp div add a mouseover listener
var stampedDivs = transcript.querySelectorAll('div');
for (var i = 0; i < stampedDivs.length; i++) {
    stampedDivs[i].addEventListener('mouseenter', highlightPassage, false);
    stampedDivs[i].addEventListener('mouseleave', updateColorByCurrenttime, false);    
	stampedDivs[i].addEventListener('click', scrollMiddle, false);
}

// Hardcoded colors for each hashtag, grabbed from the twitter site with https://en.wikipedia.org/wiki/DigitalColor_Meter
var hashtagColors = {
	"energy": "rgb(50,160,44)",
	"jobs": "rgb(255,127,0)",
	"education": "rgb(178,223,138)",
	"fairness": "rgb(252,154,153)",
	"healthcare": "rgb(227,25,27)",
	"defense": "rgb(30,120,180)",
};

////////////////////////////////////////////////////////////////////////////////
// Handling the hashtagPlot and scrubBar

// Run hashtagMousemove every time the mouse moves above the hashtagPlot
hashtagPlot.addEventListener('mousedown', addMousemove, false);
function addMousemove(e) {
	hashtagPlot.addEventListener('mousemove', hashtagMousemove, false);
}
function hashtagMousemove(e) {
	updateScrubBar(e);
	updateVideo(e);
	updateTranscript(e);
}
hashtagPlot.addEventListener('mouseup', removeMousemove, false);
function removeMousemove(e) {
	hashtagPlot.removeEventListener('mousemove', hashtagMousemove, false);
}

hashtagPlot.addEventListener('mouseout', playVideo, false);
function playVideo(e) {
	SOTUvideo.play();
}

function updateScrubBar(e) {
	// A function to make the scrubBar follow the mouse
	scrubBar.style.visibility = 'visible';
	scrubBar.style.left = e.clientX - position(hashtagPlot).x; // e.clientX is the mouse position
	scrubBar.fractionScrubbed = parseInt(scrubBar.style.left, 10)/hashtagPlot.offsetWidth;
}

function updateVideo(e) {
	SOTUvideo.currentTime = SOTUvideo.duration * scrubBar.fractionScrubbed;
}

////////////////////////////////////////////////////////////////////////////////
// Handling the scrolling transcript

function updateTranscript(e) {
	scrollToTimestamp(nearestStamp(scrubBar.fractionScrubbed));
}
function updateTranscriptByCurrenttime(e) {
	for (var i = 0; i < timestamps.length - 1; i++) {
		if ( timestamps[i+1] > Math.ceil(SOTUvideo.currentTime) + videoOffset) { 
			scrollToTimestamp(timestamps[i]);
			normalizeAll();
			highlightById(document.getElementById('transcript-time-' +timestamps[i]));
			break;
		}
	}
}

function scrollToTimestamp(timestamp) {
	var target = transcript.querySelector('#transcript-time-' + timestamp);
	document.getElementById('sotu-transcript').scrollTop = target.offsetTop - 380;
}

function nearestStamp(fractionScrubbed) {
	// Figure out what the closest timestamp we have is to the current amount of scrubbing
	var timestampEquivalent = fractionScrubbed * SOTUvideo.duration + videoOffset; // IF we had a timestamp, what would it be?
	for (var i = 0; i < timestamps.length - 1; i++) {
		if ( timestamps[i+1] > timestampEquivalent ) { // Find the first timestamp our guess is greater than
			return timestamps[i];
		}
	}
	return timestamps[timestamps.length - 1];
}


////////////////////////////////////////////////////////////////////////////////
// Adding the nav functionality for the video

var hashtagNav = document.getElementsByTagName('li');
for (var i = 0; i < hashtagNav.length; i++) {
	hashtagNav[i].addEventListener('click', navClick, false);
}

function navClick(e) {
	var timestamp = parseInt(this.getAttribute('data-timestamp'), 10);
	scrubBar.fractionScrubbed = (timestamp-videoOffset)/SOTUvideo.duration;
	updateVideo(e);
	updateTranscript(e);
}

SOTUvideo.addEventListener("timeupdate", syncVideotoOthers, false);
function syncVideotoOthers(e) {
	scrubBar.style.left = parseInt(1280 * SOTUvideo.currentTime/SOTUvideo.duration) + "px";
	videoLocation = Math.ceil(SOTUvideo.currentTime) + videoOffset;
	if (timestamps.indexOf(videoLocation) >= 0) {
		updateTranscriptByCurrenttime();
		var target = document.getElementById("transcript-time-" + timestamps[timestamps.indexOf(videoLocation)]);
		normalizeAll();
		highlightById(target);

	}
}

SOTUvideo.addEventListener("seeked", updateTranscriptAfterSeek, false);
function updateTranscriptAfterSeek(e) {
	updateTranscriptByCurrenttime();
}

// scroll/scrub to the appropriate time
function scrollMiddle(e) {
	scrollTime = parseInt(this.id.split('-')[2], 10);
	SOTUvideo.currentTime = scrollTime - videoOffset;
}

////////////////////////////////////////////////////////////////////////////////
// Adding the map coloring functionality

window.onload = function () {
	// We have to make sure that we have the nation and the states 
	// But because of the size and loading time of the SVG, we have to attach it to an event handler for window.onload to make sure it's fully loaded 

	nation = document.getElementsByTagName('object')[0].contentDocument.getElementsByTagName('svg')[0];
	statePaths = nation.querySelectorAll('.state');
	
	// Go through and get all the state abbreviations used
	stateAbbreviations = [];
	for (var i = 0; i < statePaths.length; i++ ) {
		if (statePaths[i].id.length == 2) {
			stateAbbreviations.push(statePaths[i].id);
		}
	}

	recolorNation(dominantHashtagAt(SOTUvideo.currentTime)); // This is where the action happens: recolor the states for the current time of the video.

	////////////////////////////////////////////////////////////////////////////////
	// D3

	// initialize a bunch of arrays to hold the data
	var plotData = new Array();
	for (i = 0; i < 9; ++i) plotData[i] = new Array;

	/* 

	here's the data structure that we're interested in:

	{
	    "2014-01-29 02:15:::2014-01-29 02:15": {
	        "total": [
	            [
	                "#education",
	                0.005742582086306759
	            ],
	            [
	                "#fairness",
	                0.0007116452843615948
	            ],
	            [
	                "#jobs",
	                0.0007017613220787949
	            ],
	            [
	                "#energy",
	                0.0006523415106647954
	            ],
	            [
	                "#healthcare",
	                0.00048431415185719653
	            ],
	            [
	                "#taxes",
	                0.0003558226421807974
	            ],
	            [
	                "#defense",
	                0.0002965188684839979
	            ],
	            [
	                "#immigration",
	                0.00019767924565599858
	            ],
	            [
	                "#budget",
	                0.0001680273588075988
	            ]
	        ]
	    }
	}

	This is the format we are going to:

	var layers = [
		{
			"name": "apples",
			"values": [
			  { "x": 0, "y":  91},
			  { "x": 1, "y": 290},
			  { "x": 2, "y": 10}
			]
			},
			{  
			"name": "oranges",
			"values": [
			  { "x": 0, "y":  9},
			  { "x": 1, "y": 49},
			  { "x": 2, "y": 190}
			]
		}
	];
	*/

	var tweetIntervals = Object.keys(tweetValues);
	for (var i = 0; i < tweetIntervals.length; i++) {
		// each hashtag will be a layer
		// for each time interval, stuff the totals into our new data structure. the values will be the y data and the iterator will be the x data

		// tweetValues["2014-01-29 02:15:::2014-01-29 02:15"].total[0][1]
		plotData[0][i] = tweetValues[tweetIntervals[i]].total[0][1]; // #education
		plotData[1][i] = tweetValues[tweetIntervals[i]].total[1][1]; // #fairness
		plotData[2][i] = tweetValues[tweetIntervals[i]].total[2][1]; // #jobs
		plotData[3][i] = tweetValues[tweetIntervals[i]].total[3][1]; // #energy
		plotData[4][i] = tweetValues[tweetIntervals[i]].total[4][1]; // #healthcare
		plotData[5][i] = tweetValues[tweetIntervals[i]].total[5][1]; // #taxes
		plotData[6][i] = tweetValues[tweetIntervals[i]].total[6][1]; // #defense										
		plotData[7][i] = tweetValues[tweetIntervals[i]].total[7][1]; // #immigration												
		plotData[8][i] = tweetValues[tweetIntervals[i]].total[8][1]; // #budget								
	}

	// init our new array and objects that will contain data that gets fed to the d3 stack function
	var plotLayers = new Array();
	for (i = 0; i < 9; ++i) plotLayers[i] = new Object;

	// give each layer a name (we might use this later)
	plotLayers[0].name = 'education';
	plotLayers[1].name = 'fairness';
	plotLayers[2].name = 'jobs';
	plotLayers[3].name = 'energy';
	plotLayers[4].name = 'healthcare';
	plotLayers[5].name = 'taxes';
	plotLayers[6].name = 'defense';
	plotLayers[7].name = 'immigration';
	plotLayers[8].name = 'budget';

	// iterate through, pulling data from plotData and scaling it up (might do something sharper than n*1000 once we get this working).
	for (a = 0; a < 9; a++) {
		plotLayers[a].values = new Array();
		for (i = 0; i < 63; i++) {
			plotLayers[a].values[i] = new Object;
			plotLayers[a].values[i].x = i;
			plotLayers[a].values[i].y = plotData[0][i] * 1000;
		
		console.log('DEBUG: plotlayers name: ' + plotLayers[a].name);
		console.log('DEBUG: plotlayers x value: ' + plotLayers[a].values[i].x);
		console.log('DEBUG: plotlayers y value: ' + plotLayers[a].values[i].y);
		}
	}

	// var width = 1280,
	//     height = 300;

	// processing fun
	var canvas = document.getElementsByTagName('canvas')[0];
		var width = 600;

		function sketch(p) {
			var data = []
			var y = [10, 50, 10, 20, 50, 250]; // the y-values of our vertices
			var xSpacing = width/(y.length-1); // the spacing between our vertices

			for (var i = 0; i < y.length; i++) {
				data[i] = {'x': i*xSpacing, 'y': y[i]}; // use a dictionary for easy x, y access
			}
			
			function plot(data) {
				p.fill(255, 0, 0);
				p.noStroke();

				var plot = p.beginShape();

				for (var i = 0; i < data.length; i++) {
					p.vertex(data[i].x, data[i].y);
				}
				p.vertex(data[data.length-1].x, 0); // add a point at the bottom right corner
				p.vertex(0, 0); // add a point at the origin

				p.endShape();
			}

			function normalizeCoordinates() {
				// flip Processing's weird coordinate system with (0, 0) in the top left
				p.translate(0, p.height)
				p.scale(1, -1);
			}

			function setup() {
				p.size(width, p.max(y)*1.25); // scale our sketch to be a bit bigger than our tallest y
			}

			function draw () {
				normalizeCoordinates();

				plot(data);
			}

			// tell Processing which functions to use for our setup and draw
			p.setup = setup;
			p.draw = draw;
		}

		var p = new Processing(canvas, sketch); // actually attach and run the sketch

};

// Set up the video so that the chart is updated and the nation recolored every time the time changes
document.getElementById('sotu-video').addEventListener("timeupdate", updatePage);
function updatePage() {
	var dominantHashtag = dominantHashtagAt(SOTUvideo.currentTime);
	recolorNation(dominantHashtag);
	updateChart();
}

function dominantHashtagAt(time) {
	// A function to figure out the dominant hashtag at a given time

	// Hardcoded by looking at the plot--
	var dominantHashtags = [
		[1266, 'energy'],
		[1615, 'jobs'],
		[1861, 'education'],
		[2124, 'fairness'],
		[2681, 'healthcare'],
		[3592, 'defense']
	];


	// Go backwards through the hashtags looking for the first which predates the time we're looking for
	var dominantHashtag = null;
	for ( var j = dominantHashtags.length - 1; j >= 0; j-- ) {
		var timestamp = dominantHashtags[j][0];
		var hashtag = dominantHashtags[j][1];
		timestamp -= videoOffset;

		if (time > timestamp) {
			return hashtag;
		}
	}

	// Otherwise, if going backwards hasn't found one that's before the time we're looking for, return the first
	return dominantHashtags[0][1];
}


function recolorNation(hashtag) {
	// A function to go through every state and color it correctly for a given hashtag
	try {
		for ( var k = 0; k < stateAbbreviations.length; k++ ) {
			var stateAbbreviation = stateAbbreviations[k];
			var state = nation.getElementById(stateAbbreviation);
			colorState(state, getIntervalAt(SOTUvideo.currentTime), hashtag);
		}
	}
	catch(err) {
		// throws this the first time it loads.
	}
}

function getIntervalAt(seconds) {
	// A function to get the nearest Interval we have from twitter for a given time
	return UTCtoNearestAvailableIntervalData(videoTimeToUTC(seconds));
}

function UTCtoNearestAvailableIntervalData(UTCdate) {
	// Go from a UTC date/time to the nearest available Interval we have from twitter

	// Get all the tweetIntervals from the tweetValues we loaded from values.json
	var tweetIntervals = Object.keys(tweetValues);

	for (var i = 0; i < tweetIntervals.length; i++) {
		// Tweets are indexed by interval (e.g. 2014-01-29 02:15:::2014-01-29 02:15), and we just want the start of the interval
		var tweetIntervalStart = new Date(tweetIntervals[i].split(':::')[0]);
		// As we go through, check if the time we just converted is after the time we're looking for
		if (UTCdate < tweetIntervalStart) {
			return tweetValues[tweetIntervals[i-1]];
		}
	}
}

function videoTimeToUTC(seconds){
	// From a certain number of seconds after the SOTU started, get the absolute time in UTC
	var SOTUstart = new Date(2014, 0, 28, 21, 15, 0); // the date of the SOTH
	UTCOffset = 5*60*60; // in seconds
	return new Date(SOTUstart.getTime() + 1000*(UTCOffset + seconds)); // *1000 b/c Date expects milliseconds
}

function colorState(statePath, interval, hashtag) {
	// A function to color a given state, at a given interval, for a given hashtag
	statePath.style.opacity = 0.1; // Default to 10% opacity
	statePath.style.fill = hashtagColors[hashtag]; // Figure out what color we should use

	if (Object.keys(interval).indexOf(statePath.id) != -1) { // If a state was sufficiently engaged in this interval to have data
		var range = engagementRange(interval, hashtag); // Figure out the max and min of engagement overall so we can color proportionally
		var stateEngagements = interval[statePath.id]; // And then pull out this one state's engagements with different hashtags

		for (var i = 0; i < stateEngagements.length; i++) { // Iterate over the hashtags
			if ( stateEngagements[i][0] == '#' + hashtag ) { // And when we find the one we're coloring for
				var myEngagement = parseFloat(stateEngagements[i][1], 10);
				var newOpacity = interpolate(myEngagement, range, [0.1,1]);
				statePath.style.opacity = newOpacity; // set the opacity to be proportional to our state's relative engagement
				return; // and stop iterating
			}
		}
	}
}

function engagementRange(interval, hashtag) {
	// A function getting the min (range[0]) and max (range[1]) engagement for a given hashtag in a given interval across the country
	var range = [0,0];
	for ( var state in interval ) {
		var stateData = interval[state];
		for ( var i = 0; i < stateData.length; i++ ) {
			if ('#' + hashtag == stateData[i][0]) {
				var frequency = stateData[i][1];
				range[0] = Math.min(range[0], frequency);
				range[1] = Math.max(range[1], frequency);
			}
		}
	}

	return range;
}

function updateChart() {
	// Now that we have all the needed data, actually redraw the chart

	var currentInterval = getIntervalAt(SOTUvideo.currentTime);
	var numbers = document.querySelectorAll('#hashtag-chart li div.bar'); // Get all the bar chart divs

	var rawTotals = {};
	for (var i = 0; i < numbers.length; i++) {
		// Total engagement for a given hashtag across the nation
		rawTotals[numbers[i].id] = getTotalEngagement(currentInterval, numbers[i].id);
	}

	// Figure out the range of engagement
	var maxEngagement = 0;
	var totalEngagement = 0;
	for ( var eachHashtag in rawTotals ) {
		maxEngagement = Math.max(maxEngagement, rawTotals[eachHashtag]);
		totalEngagement += rawTotals[eachHashtag];
	}

	// For each hashtag, calculate how to scale the bars so that the largest is '1'
	for (var hashtag in rawTotals) {
		var newWidth = interpolate(rawTotals[hashtag], [0, maxEngagement], [0,1])*65 + '%';
		var bar = document.querySelector('li div#' + hashtag);
		bar.style.width = newWidth;

		// Color the dominant hashtag, make the rest gray
		var sibling = null; // Holds the text next to each bar
		if (hashtag == dominantHashtagAt(SOTUvideo.currentTime)) {
			bar.style.backgroundColor = hashtagColors[hashtag];
			sibling = bar.parentNode.getElementsByClassName('hashtag')[0];
			sibling.style.color = hashtagColors[hashtag];
		}
		else {
			sibling = bar.parentNode.getElementsByClassName('hashtag')[0];
			sibling.style.color = '#d3d3d3';
			bar.style.backgroundColor = '#d3d3d3';
		}

	}
}


function getTotalEngagement(interval, hashtag) {
	// A function to sum up total engagement so we can plot things proportionally
	var sum = 0;
	for ( var state in interval ) {
		var stateData = interval[state];
		for ( var i = 0; i < stateData.length; i++ ) {
			if ('#' + hashtag == stateData[i][0]) {
				sum += stateData[i][1];
			}
		}
	}

	return sum;
}


////////////////////////////////////////////////////////////////////////////////
// Utility functions

function position(element) {
	// A function which takes an element and returns a dictionary with its x and y position
    for (var lx=0, ly=0;
         element !== null;
         lx += element.offsetLeft, ly += element.offsetTop, element = element.offsetParent);

    return {x: lx, y: ly};
}

function interpolate(value, from, to) {
	// A function that lets us scale a value from one scale to another-- e.g. 5 : [0, 10] to 0.5 for [0, 1]
	var fromSpread = from[1] - from[0];
	var toSpread = to[1] - to[0];
	
	var ratio = toSpread/fromSpread;

	return (value - from[0])*ratio + to[0];
}

function normalizeAll(e) {
	for (var i = 0; i < timestamps.length - 1; i++) {
		var target = document.getElementById('transcript-time-' + timestamps[i]);
		target.style.backgroundColor = "#fff";
	}
}
function highlightById(divId) {
	divId.style.backgroundColor = "#eee";
}

function highlightPassage(e) {
		this.style.backgroundColor = "#ffc";
}

function updateColorByCurrenttime(e) {
	for (var i = 0; i < timestamps.length - 1; i++) {
		if ( timestamps[i+1] > Math.ceil(SOTUvideo.currentTime) + videoOffset) { 
			normalizeAll();
			highlightById(document.getElementById('transcript-time-' +timestamps[i]));
			break;
		}
	}
}




