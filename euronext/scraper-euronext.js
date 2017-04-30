/**
 * Created by nicolas.urgin on 30/04/17.
 */

var fs = require('fs');
var superagent = require('superagent');
var cheerio = require('cheerio');
var async = require('async');
var moment = require('moment');
var mkdirp = require('mkdirp');

var $ = null;

// Configuration
moment.locale('fr');

// Constantes

var BASE_URL = 'https://www.euronext.com/';
var PATH_COMPOSANT_CAC_ALL_TRADABLE = '/fr/nyx-index-composition/ajax/index/FR0003999499-XPAR?ic_page=0';
var PATH_INTRADAY = '/sites/www.euronext.com/modules/common/common_listings/custom/nyx_eu_listings/nyx_eu_listings_price_chart/pricechart/pricechart.php';

var DATA_DIRECTORY = "./data";

// lancer le traitement
async.waterfall([
    // récupérer la liste de composants de l'indice dont l'url est fournie en paramètre
    function (callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        getCompositionList(BASE_URL + PATH_COMPOSANT_CAC_ALL_TRADABLE, null, callback);
    },
    // récupérer les données intraday des composants
    function (data, callback) {
        console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
        getIntradayData(data, callback);
    }
], function (err, result) {
    // result now equals 'done'
    if (err) {
        console.error('= = = = = = ERROR = = = = = = ERROR = = = = = = ERROR = = = = = =');
        throw err;
    }
    console.log('= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =');
});

/**
 * Récupérer les composants de l'url en paramètre.
 */
function getCompositionList(url, data, callback) {
    console.log('Récupération du contenu : ' + url);

    superagent
        .get(url)
        .end(function (error, response) {
            if (error) {
                callback(error);
            } else {
                var json = JSON.parse(response.text);
                data = getCompositionData(json.ic_div, data);
            }

            if (data.nextPagePath) {
                getCompositionList(BASE_URL + data.nextPagePath, data, callback);
            } else {
                callback(error, data);
            }
        });
}

/**
 * Récupérer les données des grilles lotofoot à partir du contenu html.
 */
function getCompositionData(div, data) {
    // charger le html
    $ = cheerio.load(div);

    var json = data ? data : {composants: []};

    // récupérer la liste des composants
    $('tr.odd, tr.even').each(function (index, element) {

        var tr = $(this);

        // récupérer les données du composant
        var titreComposant = tr.children().first();
        var isin = titreComposant.next();
        var tradingLocation = isin.next();

        var composant = {
            titre: titreComposant.text().trim(),
            isin: isin.text().trim(),
            tradingLocation: tradingLocation.text().trim()
        };

        json.composants.push(composant);
    });

    // récupérer l'url de la page suivante
    var nextPageListItem = $('li.pager-next');

    if (nextPageListItem) {
        json.nextPagePath = nextPageListItem.children().first().attr('href');
    } else {
        json.nextPagePath = undefined;
    }

    return json;
}

/**
 * Récupérer les données intraday des composants.
 */
function getIntradayData(compositionData, callback) {
    console.log('Récupération des données intraday du ' + moment().format('LL') + ' :');

    var timestamp = moment().startOf('day').format('x');

    async.eachSeries(compositionData.composants, function (composant, eachSeriesCallback) {
        console.log(composant.titre);
        superagent
            .get(BASE_URL + PATH_INTRADAY)
            .query({
                q: 'intraday_data',
                from: timestamp,
                isin: composant.isin,
                mic: 'XPAR',
                dateFormat: 'd/m/Y',
                locale: 'null'
            })
            .end(function (error, response) {
                if (error) {
                    console.log('error');
                    callback(error);
                } else {
                    saveIntradayData(composant, JSON.parse(response.text), eachSeriesCallback);
                }
            });
    }, function (error) {
        callback(error);
    });
}

/**
 *
 */
function saveIntradayData(composant, intradayData, callback) {
    var saveDirectory = DATA_DIRECTORY + '/' + moment().format('YYYY-MM-DD');
    var filepath = saveDirectory + '/' + composant.isin + '.json';

    var writeFile = function () {
        fs.writeFile(filepath, JSON.stringify(intradayData, null, 2), function (error) {
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
}
