#!/usr/bin/env node

'use strict';

var pkg = require('./package.json'),
    // path = require('path'),
    // fs = require('fs'),
    cli = require('commander'),
    colors = require('colors/safe'),
    usb = require('usb');

var vendor,
    commands;

vendor = { vid: 0x5345, pid: 0x1234, name: 'Owon SDS7102' };

commands = {
    STARTBMP: 12,
    STARTBIN: 12,
    STARTMEMDEPTH: 12,
    STARTDEBUGTXT: 4
};

function deviceList () {
    var list;
    console.log(colors.bold.underline('USB devices:'));
    list = usb.getDeviceList();
    list.forEach(function (e) {
        var line;
        line = e.busNumber + ':' + e.deviceAddress + ' ' +
        e.deviceDescriptor.idVendor.toString(16) + ':' +
        e.deviceDescriptor.idProduct.toString(16);
        if (
            e.deviceDescriptor.idVendor === vendor.vid &&
            e.deviceDescriptor.idProduct === vendor.pid
        ) {
            line = colors.green(line);
        }
        console.log(line);
    });
}


function header (buff, offset) {
    var res;
    res = {};

    res.model = buff.toString('ascii', offset, offset + 6); offset += 6;
    res.intsize = buff.toString('ascii', offset, offset + 4); offset += 4;
    res.serial = buff.toString('ascii', offset, offset + 30); offset += 30;
    res.triggerstatus = buff.readUInt8(offset++);
    res.unknownstatus = buff.readUInt8(offset++);
    res.unknownvalue1 = buff.readInt32LE(offset); offset += 4;
    res.unknown3 = buff.toString('ascii', offset, offset + 7); offset += 7;
    res.channels_count = buff.readUInt8(offset++);
//    res.tail = buff.toString('ascii', offset, offset + 6); offset += 6;
    console.log({ header: res });
    return offset;
}

function channel (buff, offset) {
    var res;
    res = {};

    res.name = buff.toString('ascii', offset, offset + 3); offset += 3;
    res.lengthblock = buff.readInt32LE(offset); offset += 4;

    res.datatype = buff.readInt32LE(offset); offset += 4;
    res.unknown4 = buff.readInt32LE(offset); offset += 4;
    res.samples_count = buff.readUInt32LE(offset); offset += 4;
    res.samples_file = buff.readUInt32LE(offset); offset += 4;
    res.samples3 = buff.readUInt32LE(offset); offset += 4;
    res.timediv = buff.readUInt32LE(offset); offset += 4;
    res.offsety = buff.readInt32LE(offset); offset += 4;
    res.voltsdiv = buff.readInt32LE(offset); offset += 4;
    res.attenuation = buff.readUInt32LE(offset); offset += 4;
    res.time_mul = buff.readFloatLE(offset); offset += 4;
    res.frequency = buff.readFloatLE(offset); offset += 4;
    res.period = buff.readFloatLE(offset); offset += 4;
    res.volts_mul = buff.readFloatLE(offset); offset += 4; // voltsMultiplier

    console.log({ channel: res});
    offset += 4;
    return offset;
}

function arr (buff) {
    var i, res;
    // offset = header(buff, 0);
    res = '[';
    console.log('length: ' + buff.length);
    for (i = 0; i < buff.length / 2; i++) {
        if (i) {
            res += ', ';
        }
        res += buff.readUInt16BE(i * 4, 4);
    }
    res += ']';
    console.log(res);
}

function datas (buff, offset) {
    var len, res;

    len = buff.length;
    res = [];
    while (offset < len) {
        res.push(buff.readInt16BE(offset, 2));
        offset += 2;
    }
    console.log(JSON.stringify(res));
    return offset;
}


function dump () {
    var theDevice,
        theInterface,
        inEndpoint,
        outEndpoint;

    theDevice = usb.findByIds(vendor.vid, vendor.pid);

    if (theDevice === undefined) {
        console.log(colors.red('compatible oscilloscope is not connected'));
        return;
    }

    theDevice.open();
    theDevice.reset(function (err) {
        if (err) { throw err; }

        // console.log(theDevice);
        theInterface = theDevice.interfaces[0];
        theInterface.claim();
        // console.log(theInterface);
        inEndpoint = theInterface.endpoints[0];
        outEndpoint = theInterface.endpoints[1];
        // console.log(outEndpoint);

        outEndpoint.transfer('STARTBIN', function (err0) {
            if (err0) { throw err0; }
            console.log('STARTBIN');
            inEndpoint.timeout = 1000;
            inEndpoint.transfer(512, function (err1, data1) {
                if (err1) {
                    console.log(err1);
                    throw err1;
                }
                console.log(data1.toString('ascii'));
                inEndpoint.transfer(10000000, function (err2, data2) {
                    var offset;
                    if (err2) {
                        console.log(err2);
                        throw err2;
                    }
                    offset = header(data2, 0);
                    offset = channel(data2, offset);
                    offset = datas(data2, offset);
                    theInterface.release(function (err3) {
                        if (err3) { throw err3; }
                        theDevice.close();
                    });
                });
            });
        });
    });
}

cli
    .version(pkg.version)
    .usage('[options]')
    .option('-l, --list', 'list all USB devices')
    .option('-d, --dump <file>', 'dump file from the oscilloscope')
    .parse(process.argv);

if (!cli.list && !cli.dump) {
    cli.help();
}

if (cli.list) {
    deviceList();
}

if (cli.dump) {
    dump();
}
