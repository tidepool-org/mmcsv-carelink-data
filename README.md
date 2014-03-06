mmcsv
===========

Scraper and Parser for Medtronic pump, cgb and connected bg meter data.

## Looking at the code

Primary entry-point is `lib/index.js`.

Parsing and fetching code is broken down by vendor-specific objects on the thing returned from `lib/index.js`.

That is currently just carelink right now.

Easiest way to see how to use the parser is to look at `test/carelink/testParser.js`

## Command Line

### Fetch
You can fetch raw data from carelink with

```bash
./bin/mmcsv fetch -u <username> -p <password> -d <num_days> stdout
```

### Parse
You can parse raw data fetched from carelink with

``` bash
node bin/parse.js <csv_file_to_parse>
```

