mmcsv
===========

Scraper and Parser for Medtronic pump, cgb and connected bg meter data.

## Install
From source
```bash
$ git clone git://github.com/tidepool-org/mmcsv-carelink-data.git mmcsv
$ cd mmcsv
$ npm install
```
[![Build Status](https://travis-ci.org/tidepool-org/mmcsv-carelink-data.png?branch=master)](https://travis-ci.org/tidepool-org/mmcsv-carelink-data)
[![Code Climate](https://codeclimate.com/github/tidepool-org/mmcsv-carelink-data.png)](https://codeclimate.com/github/tidepool-org/mmcsv-carelink-data)
[![Coverage Status](https://coveralls.io/repos/tidepool-org/mmcsv-carelink-data/badge.png?branch=master)](https://coveralls.io/r/tidepool-org/mmcsv-carelink-data)

[![browser support](https://ci.testling.com/tidepool-org/mmcsv-carelink-data.png)](https://ci.testling.com/tidepool-org/mmcsv-carelink-data)


### Test
```bash
$ make test
```

## Usage
```bash
$ mmcsv -h
Usage: mmcsv <command> [opts]

## Commands
Command is one of:

  fetch              Fetch csv from carelink.
  parse              Parse Carelink csv.
  version            Print version of this module.

  --help, -h         This help.


Options:
  --help, -h  Some more details about mmcsv
```

```bash
$ mmcsv parse -h
### Parse
Parse Carelink CSV into JSON.

Usage: mmcsv parse <opts> [./path/to.csv|stdin]
Parser options:

     --filter=all,   -f all
     --filter=smbg,  -f smbg
     --filter=cbg,   -f cbg
     --filter=basal, -f basal
     --filter=bolus, -f bolus
     --filter=carbs, -f carbs


Options:
  --help, -h  Some more details about mmcsv

```

```bash
### Fetch
Fetch raw csv from carelink

Usage: mmcsv fetch <opts> [./path/to.csv|stdout]
Options:
  --username=, -u    Carelink username
  --password=, -p    Carelink password
  --days, -d         Number of days to fetch
  --json, -j         Output json, not csv


Options:
  --help, -h  Some more details about mmcsv

```