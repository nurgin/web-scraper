/**
 * Created by nicolas.urgin on 05/05/17.
 */

var fs = require('fs');
var async = require('async');
var mkdirp = require('mkdirp');

// Configuration

// Constantes

var DATA_DIRECTORY = "./data";
var CLEAN_DIRECTORY = "./clean";

// lancer le traitement
async.waterfall([
    // récupérer les répertoires contenant les données téléchargées
    function (callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        getDirectoryContent(DATA_DIRECTORY, callback);
    },
    // traiter les répertoires récupérés
    function (directories, callback) {
        processDirectories(directories, callback);
    }
], function (err, result) {
    if (err) {
        console.error('= = = = = = ERROR = = = = = = ERROR = = = = = = ERROR = = = = = =');
        throw err;
    }
    console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
});

/**
 * List the content of the directory.
 * @param  {Function} callback function to call after processing
 * @return {void}
 */
function getDirectoryContent(directory, callback) {
    fs.readdir(directory, function (error, files) {
        if (error) callback(error);

        var elements = [];

        files.forEach(function (file, index) {
            if (file !== '.' && file !== '..') {
                elements.push(file);
            }
        });

        callback(null, elements);
    });
}

/**
 * Process the data in the directories.
 * @param  {Array}    directories directories to process
 * @param  {Function} callback    function to call after processing
 * @return {void}
 */
function processDirectories(directories, callback) {

    async.eachSeries(directories, function (directory, eachSeriesCallback) {
        console.log('Processing ' + directory + '...');

        async.waterfall([
            // récupérer les fichiers du répertoire courant
            function (waterfallCallback) {
                getDirectoryContent(DATA_DIRECTORY + '/' + directory, waterfallCallback);
            },
            // traiter les fichiers récupérés
            function (files, waterfallCallback) {
                processFiles(files, directory, waterfallCallback);
            },
            // supprimer le répertoire après traitement
            function (waterfallCallback) {
                removeDirectory(DATA_DIRECTORY + '/' + directory, waterfallCallback);
            }
        ], function (error, result) {
            eachSeriesCallback(error, result);
        });
    }, function (error) {
        console.log('All directories done');
        callback(error);
    });
}

/**
 * Process the data in the files.
 * @param  {Array}    files    files to process
 * @param  {Function} callback function to call after processing
 * @return {void}
 */
function processFiles(files, directory, callback) {
    
    var indexOfRecovery = files.indexOf('recovery.json');
    if(indexOfRecovery != -1) {
        files.splice(indexOfRecovery, 1);
    }

    async.eachSeries(files, function (file, eachSeriesCallback) {
        process.stdout.write(file + '\r');

        async.waterfall([
            // charger les données du fichier
            function (waterfallCallback) {
                loadFileData(DATA_DIRECTORY + '/' + directory + '/' + file, waterfallCallback);
            },
            // traiter les données chargées
            function (filedata, waterfallCallback) {
                processFileData(filedata, waterfallCallback);
            },
            // vérifier les données traitées
            function (cleanData, rawData, waterfallCallback) {
                checkProcessedData(cleanData, rawData, waterfallCallback);
            },
            // sauvegarder les donées propres dans un fichier
            function (cleanData, waterfallCallback) {
                saveFileData(cleanData, CLEAN_DIRECTORY + '/' + directory, file, waterfallCallback);
            },
            // supprimer le fichier brut après traitement
            function (waterfallCallback) {
                removeFile(DATA_DIRECTORY + '/' + directory + '/' + file, waterfallCallback);
            }
        ], function (error) {
            eachSeriesCallback(error);
        });
    }, function (error) {
        console.log('All files done   ');
        callback(error);
    });
}

/**
 * Load data from a file.
 * @param  {String}   filepath path of the file to load
 * @param  {Function} callback function to call after processing
 * @return {void}
 */
function loadFileData(filepath, callback) {
    var filedata = require(filepath);
    callback(null, filedata);
}

/**
 * Process data from a file.
 * @param  {Object}   filedata data of the file
 * @param  {Function} callback function to call after processing
 * @return {void}
 */
function processFileData(filedata, callback) {
    var cleanData;
    var trades = filedata.data;

    if (trades != undefined) {
        var firstTrade = trades[0];
        cleanData = {
            isin: firstTrade.ISIN,
            tradingLocation: firstTrade.MIC,
            timeZone: firstTrade.timeZone,
            currency: firstTrade.currency,
            transactions: []
        };

        var currentTrade = {};

        // parcourir les trades
        trades.forEach(function (trade, index) {
            var transactionsSize = cleanData.transactions.length;
            // si il n'y a pas de transaction ou si la date du trade est différente de celle la transaction courante
            if (transactionsSize == 0 || trade.dateAndTime != currentTrade.dateAndTime) {
                // alors on initialise une nouvelle transaction et on l'ajoute au tableau
                currentTrade = {
                    dateAndTime: trade.dateAndTime,
                    price: parseFloat(trade.price.replace(',', '.')),
                    tradeQualifier: trade.TRADE_QUALIFIER,
                    numberOfShares: []
                };

                cleanData.transactions.push(currentTrade);
            }

            currentTrade.numberOfShares.push(parseInt(trade.numberOfShares.replace(',', '.')));
        });

    }

    callback(null, cleanData, trades);
}

/**
 * Check that the processed data is good.
 * @param  {Object}   cleanData processed data
 * @param  {Object}   rawData   raw data
 * @param  {Function} callback  function to call after processing
 * @return {void}
 */
function checkProcessedData(cleanData, rawData, callback) {
    if (cleanData != undefined && rawData == undefined || cleanData == undefined && rawData != undefined) {
        callback('Les donnees brutes et les donnees traitees sont defined/undefined.');
    } else if (cleanData != undefined && rawData != undefined) {
        var nbTransaction = 0;
        cleanData.transactions.forEach(function (transaction, index) {
            nbTransaction += transaction.numberOfShares.length;
        });

        if (nbTransaction == rawData.length) {
            callback(null, cleanData);
        } else {
            callback('Le volume de transaction ne correspond pas entre les donnees brutes et les donnees traitees.');
        }
    } else {
        callback(null, cleanData);
    }
}

/**
 * Save data into a file.
 * @param  {Object}   data          data to save
 * @param  {String}   saveDirectory path of the save directory
 * @param  {String}   filename      name of the file
 * @param  {Function} callback      function to call after processing
 * @return {void}
 */
function saveFileData(data, saveDirectory, filename, callback) {
    if (data != undefined) {
        var filepath = saveDirectory + '/' + filename;

        var writeFile = function () {
            fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf8', function (error) {
                callback(error);
            });
        };

        fs.exists(filepath, function (exists) {
            if (!exists) {
                mkdirp(saveDirectory, function (error) {
                    if (error) {
                        callback(error);
                    } else {
                        writeFile();
                    }
                });
            } else {
                writeFile();
            }
        });
    } else {
        callback(null);
    }
}

/**
 * Remove a file.
 * @param  {String}   filepath path of the file to remove
 * @param  {Function} callback function to call after processing
 * @return {void}
 */
function removeFile(filepath, callback) {
    fs.unlink(filepath, callback);
}

/**
 * Remove a directory.
 * @param  {String}   directory path of the directory to remove
 * @param  {Function} callback  function to call after processing
 * @return {void}
 */
function removeDirectory(directory, callback) {
    fs.rmdir(directory, callback);
}
