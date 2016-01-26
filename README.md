#Serverless Test Plugin

[![npm version](https://badge.fury.io/js/serverless-test-plugin.svg)](https://badge.fury.io/js/serverless-test-plugin)

Simple _Integration Test Framework_ for [Serverless](http://www.serverless.com). This plugin is basically a
reimplementation of the `run` command, validating a function's _success_. You can test all
functions of your component by passing the `--all` option, and write the results into a 
JUnit compatible reports XML by specifying `--out <file-name>`.

This plugin is intended to run _besides_ your regular Unit Tests such as [Mocha](https://mochajs.org/), not as a replacement. It will solely validate that your functions have no compilation errors and can successfully run the provided `event.json`. At this point there's no output validation other than checking for success, failure or a timeout (that is, if your Lambda code exceeds the specified timeout value). 

Typically you want to run this plugin right before deploying your Lambda code.


The easiest example of running this plugin is

```
serverless function test --all
```

**Note:** Serverless *v0.1.4* or higher is required.


###Configuration

This plugin can be configured on a function level by adding a `test` definition to the `custom`
section in your `s-function.json`.

Example:

```
"custom": {
  "test": {
    "skip": true
  }
}
```

Available options are

* `skip` - boolean; skip this function from all tests
* `event` - string; name of the event JSON definition; defaults to `event.json`


###Usage

Test an individual function:

```
serverless function test <component>/<module>/<function>
```


Test all functions in the project:

```
serverless function test --all
```


Test all functions and output results into a JUnit compatible XML:

```
serverless function test --all --out test_results/report.xml
```

