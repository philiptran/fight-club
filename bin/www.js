#!/usr/bin/env node

const config = require('config');
const _ = require("lodash");
var redis, redisPub, redisSub;
if (_.get(config.redis, 'enabled', true)) {
    redis = require('../services/redis');
    redisPub = require('../services/redis_publisher');
    redisSub = require('../services/redis_subscriber');
}
const logger = require('../services/logger.js');
const mongodb = require('../services/mongodb');
const game = require('../services/game');
const app = require('../app.js');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const Promise = require('bluebird');
const sockets = require('../sockets');

const io = require('../services/io');

console.log('Redis enabled ' + _.get(config, 'redis.enabled'));

Promise.props({
    redis: new Promise(function (resolve, reject) {
        if (_.get(config.redis, 'enabled', true)) {
            redis.on('connect', function () {
                return resolve(redis);
            });
            redis.on('error', reject);
        }
        else {
            return resolve(null);
        }
    }),
    redisPub: new Promise(function (resolve, reject) {
        if (_.get(config.redis, 'enabled', true)) {
            redisPub.on('connect', function () {
                return resolve(redisPub);
            });
            redisPub.on('error', reject);
        }
        else {
            return resolve(null);
        }
    }),
    redisSub: new Promise(function (resolve, reject) {
        if (_.get(config.redis, 'enabled', true)) {
            redisSub.on('connect', function () {
                return resolve(redisSub);
            });
            redisSub.on('error', reject);
        }
        else {
            return resolve(null);
        }
    }),
    mongodb: new Promise(function (resolve, reject) {
        if (!_.isNil(mongodb)) {
            mongodb.on('connected', function () {
                return resolve(mongodb);
            });
            mongodb.on('error', reject);
        } else {
            return resolve();
        }

    }),
    game: game
})
    .then(function (connections) {
        _.assign(app.locals, connections);
        return start_server()
            .then(function (http_server) {
                io.attach(http_server);
                app.locals.io = io;
                io.on('connection', function (socket) {
                    sockets(_.merge({io: io, socket: socket}, connections));
                });
            });
    });


function start_server() {
    return new Promise(function (resolve, reject) {
        var tls_config = config.has('tls') ? config.get('tls') : undefined;

        var port = process.env.SERVER_PORT ? _.toInteger(process.env.SERVER_PORT) : _.toInteger(config.get('port'));


        var server;
        if (!_.isNil(tls_config)) {
            server = https.createServer(tls_config, app);
        } else {
            server = http.createServer(app);
        }


        server.listen(port);

        server.once('error', function (error) {
            if (error.syscall !== 'listen') {
                return reject(error);
            }

            var bind_address = _.isString(port) ? 'Pipe ' : 'Port ' + _.toString(port);
            switch (error.code) {
                case 'EACCES':
                    logger.error(bind_address + ' requires elevated privileges');
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    logger.error(bind_address + ' is already in use');
                    process.exit(1);
                    break;
                default:
                    return reject(error);
            }

        });

        server.once('listening', function () {
            var bind_address = _.isString(port) ? 'Pipe ' : 'Port ' + _.toString(port);
            logger.info('Listening on ' + bind_address);
            var serverType = process.env.GAME_SERVER_OPTS_SERVER_TYPE;
            logger.info('Server is a ' + serverType);
            return resolve(server);
        });


        process.once('SIGTERM', function () {
            logger.info('SIGTERM received.');
            server.close(function () {
                logger.info('Exiting.');
                process.exit(0);
            });
        });


    });

}
