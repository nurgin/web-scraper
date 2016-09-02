/**
 * Created by nicolas.urgin on 06/07/2016.
 */
var async = require('async');
var request = require('request');
var cheerio = require('cheerio');
var config = require('./config');

async.waterfall([
    //myFirstFunction,
    //mySecondFunction,
    //myLastFunction,
    //createFolders,
    //downloadXmlFile,
    requestCoursePage,
    parseCoursePage
], function (err, stringResult, jsonResult) {
    // result now equals 'done'
    if (err) console.log(err);
    if(stringResult) console.log(stringResult);
    if(jsonResult) console.log(JSON.stringify(jsonResult, null, 2));

});

function requestCoursePage(callback) {
    console.log('- requestCoursePage : ' + config.courseUrl);
    request({uri: config.courseUrl, auth: {user: 'nicolas.urgin.jr@gmail.com', pass: 'folken971', sendImmediately: false}}, function (error, response, html) {
        callback(error, html);
    });
}

function parseCoursePage(html, callback) {
    console.log('- parseCoursePage');

    var courseData = {};
    var $ = cheerio.load(html);

    // extraire le titre du cours
    $('.class-details-title').filter(function () {
        courseData.title = cleanTitle($(this).text());
    });

    // extraire l'auteur du cours
    $('.class-details-teacher-info').filter(function () {
        var courseAuthor = $(this).text();
        courseAuthor = courseAuthor.substring(0, courseAuthor.indexOf(','));

        courseData.author = courseAuthor.trim();
    });

    // extraire la liste de vidéos du cours
    $('.unit-item').filter(function () {

        var listItemArray = $(this).children().first().children();

        courseData.videos = [];

        listItemArray.each(function(index, listItem) {
            var video = {};

            var rankDiv = $(listItem).children().first().children().first().next();
            var videoTitleDiv = rankDiv.next();
            var videoDurationDiv = videoTitleDiv.next();

            video.rank = rankDiv.attr('data-rank');
            video.title = cleanTitle(videoTitleDiv.text());
            video.duration = videoDurationDiv.text();

            courseData.videos.push(video);
        });
    });

    // sign up
    var userMenu = '';
    $('.sign-up-button').filter(function () {
        userMenu += $(this).text();
    });

    // extraire info utilisateur
    $('.user-menu').filter(function () {
        userMenu += $(this).html();
    });

    callback(null, userMenu/*, courseData*/);
}

function cleanTitle(title) {

    title = title.replace('Premium class\n', '');
    title = title.replace(/\n/i, '');
    title = title.replace(/\n/i, '');

    return title.trim();
}