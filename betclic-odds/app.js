/**
 * Created by nicolas.urgin on 27/02/16.
 */
var fs = require('fs');
var http = require('http');
var util = require('util');

var async = require('async');
var xml2js = require('xml2js');
var db = require('diskdb');

var config = require('./config');
var folders = ['xml', 'db'];
var xmlFilePath = './xml/odds.xml';
var FOOTBALL_SPORT_ID = 1;

async.waterfall([
    //myFirstFunction,
    //mySecondFunction,
    //myLastFunction,
    //createFolders,
    //downloadXmlFile,
    parseXmlFile,
    extractData,
    storeOddsData
], function (err, result) {
    // result now equals 'done'
    if (err) console.log(err);
    console.log(JSON.stringify(result, null, 2));
});

/**
 * Create all the folders for this script.
 * @param callback
 */
function createFolders(callback) {
    console.log('Checking folders...');

    async.each(folders, function (folder, callbackEach) {

        fs.exists('./' + folder, function (exists) {
            if (exists) {
                callbackEach();
            } else {
                fs.mkdir('./' + folder, function (err) {
                    callbackEach(err);
                });
            }
        });
    }, function (err) {
        callback(err);
    });
}

/**
 * Download the XML file of betclic's odds.
 * @param callback
 */
function downloadXmlFile(callback) {
    console.log('Downloading XML file...');

    var file = fs.createWriteStream(xmlFilePath);

    var request = http.get(config.url, function (response) {
        response.pipe(file);
        file.on('finish', function () {
            file.close(callback);  // close() is async, call cb after close completes.
        });
    }).on('error', function (err) { // Handle errors
        fs.unlink(xmlFilePath); // Delete the file async. (But we don't check the result)
        callback(err.message);
    });
}

/**
 * Parse the XML data to get JSON data.
 * @param callback
 */
function parseXmlFile(callback) {
    console.log('Parsing XML file...');

    var parser = new xml2js.Parser({mergeAttrs: true, explicitArray: false});

    fs.readFile(xmlFilePath, function (err, data) {
        if (err) callback(err);

        parser.parseString(data, function (err, result) {
            //console.dir(result);
            //console.log('Done');
            //console.log(JSON.stringify(result, null, 2));
            callback(null, result);
        });
    });
}

/**
 * Extract football data.
 * @param allData all data from betclic
 * @param callback
 */
function extractData(allData, callback) {
    console.log('Extracting data...');

    var extractedData = {};
    extractedData.file_date = allData.sports.file_date;

    allData.sports.sport.forEach(function (sport) {
        if (sport.id == FOOTBALL_SPORT_ID) {
            extractedData.football = sport;
        }
    });

    callback(null, extractedData);
}

/**
 * Store data int database.
 * @param data
 * @param callback
 */
function storeOddsData(data, callback) {
    db.connect('./db', ['event', 'match']);
    console.log('Storing data...');
    console.time('storeOddsData');

    var stats = {insertedEvent: 0, updatedEvent: 0, insertedMatch: 0, updatedMatch: 0};
    var upsertResult;

    data.football.event.forEach(function (event) {

        if (util.isArray(event.match)) {
            event.match.forEach(function (match) {
                match.eventId = event.id;
                match.updated = event.file_date;
                upsertResult = upsertMatch(db, match);

                stats.insertedMatch = stats.insertedMatch + upsertResult.inserted;
                stats.updatedMatch = stats.updatedMatch + upsertResult.updated;
            });
        } else {
            event.match.eventId = event.id;
            event.match.updated = event.file_date;
            upsertResult = upsertMatch(db, event.match);

            stats.insertedMatch = stats.insertedMatch + upsertResult.inserted;
            stats.updatedMatch = stats.updatedMatch + upsertResult.updated;
        }

        delete event.match;
        upsertResult = upsertEvent(db, event);

        stats.insertedEvent = stats.insertedEvent + upsertResult.inserted;
        stats.updatedEvent = stats.updatedEvent + upsertResult.updated;
    });

    console.timeEnd('storeOddsData');
    callback(null, stats);
}

function upsertEvent(db, event) {
    var query = {id: event.id};
    var options = {multi: false, upsert: true};

    return db.event.update(query, event, options);
}

function upsertMatch(db, match) {
    var query = {id: match.id};
    var options = {multi: false, upsert: true};

    return db.match.update(query, match, options);
}
function mySecondFunction(arg1, arg2, callback) {
    // arg1 now equals 'one' and arg2 now equals 'two'
    callback(null, 'three');
}
function myLastFunction(arg1, callback) {
    // arg1 now equals 'three'
    callback(null, 'done');
}