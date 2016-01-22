#Serverless Test Plugin

**Note:** Serverless *v0.1.0* or higher is required.

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
* `event` - string; name of the event JSON definition; defaults to `event.js`


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

