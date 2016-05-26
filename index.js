'use strict';

/**
 * Serverless Test Plugin
 */

module.exports = function(S) {

	const BbPromise = require('bluebird'),
		SCli        = require(S.getServerlessPath('utils/cli')),
		SError      = require(S.getServerlessPath('Error')),
		chalk       = require('chalk'),
		JUnitWriter = require('junitwriter'),
		intercept   = require('intercept-stdout');

	/**
	 * ServerlessTestPlugin
	 */

	class ServerlessTestPlugin extends S.classes.Plugin {

		/**
		 * Constructor
		 * - Keep this and don't touch it unless you know what you're doing.
		 */

		constructor() {
			super();
		}

		/**
		 * Define your plugins name
		 * - We recommend adding prefixing your personal domain to the name so people know the plugin author
		 */

		static getName() {
			return 'com.serverless.' + ServerlessTestPlugin.name;
		}

		/**
		 * Register Actions
		 * - If you would like to register a Custom Action or overwrite a Core Serverless Action, add this function.
		 * - If you would like your Action to be used programatically, include a "handler" which can be called in code.
		 * - If you would like your Action to be used via the CLI, include a "description", "context", "action" and any options you would like to offer.
		 * - Your custom Action can be called programatically and via CLI, as in the example provided below
		 */

		registerActions() {

			S.addAction(this._runFunctionTest.bind(this), {
				handler:       'runFunctionTest',
				description:   'Run tests on a given function',
				context:       'function',
				contextAction: 'test',
				options:       [{ // These must be specified in the CLI like this "-option true" or "-o true"
					option:      'all',
					shortcut:    'a',
					description: 'Optional - Test all functions'
				},{
					option:      'out',
					shortcut:    'o',
					description: 'Optional - JUnit output file'
				},{
					option:      'stage',
					shortcut:    's',
					description: 'The stage used to populate your templates. Default: the first stage found in your project'
				},{
					option:      'region',
					shortcut:    'r',
					description: 'The region used to populate your templates. Default: the first region for the first stage found.'
				}],
				parameters: [{
					parameter: 'names',
					description: 'One or multiple function names',
					position: '0->'
				}]
			});

			return BbPromise.resolve();
		}

		/**
		 * Register Hooks
		 * - If you would like to register hooks (i.e., functions) that fire before or after a core Serverless Action or your Custom Action, include this function.
		 * - Make sure to identify the Action you want to add a hook for and put either "pre" or "post" to describe when it should happen.
		 */

		registerHooks() {
			return BbPromise.resolve();
		}

		/**
		 * Custom Action Example
		 * - Here is an example of a Custom Action.  Include this and modify it if you would like to write your own Custom Action for the Serverless Framework.
		 * - Be sure to ALWAYS accept and return the "evt" object, or you will break the entire flow.
		 * - The "evt" object contains Action-specific data.  You can add custom data to it, but if you change any data it will affect subsequent Actions and Hooks.
		 * - You can also access other Project-specific data @ this.S Again, if you mess with data on this object, it could break everything, so make sure you know what you're doing ;)
		 */

		_runFunctionTest(evt) {

			// Set an environment variable the invoked functions can check for
			process.env.SERVERLESS_TEST = true;

			// Prepare result object
			evt.data.result = { status: false };

			// Instantiate Classes
			let functions;
			if (evt.options.all) {
				// Load all functions
				functions = S.getProject().getAllFunctions();
			}
			else if (S.cli && evt.options.names && evt.options.names.length === 0) {
				// no names or options so use cwd behavior
				// will return all functions if none in cwd
				functions = S.utils.getFunctionsByCwd(S.getProject().getAllFunctions());
			}
			else if (evt.options.names && evt.options.names.length > 0) {
				// return by passed name(s)
				functions = evt.options.names.map(name => {
					const func = S.getProject().getFunction(name);
					if (!func) {
						throw new SError(`Function ${name} does not exist in your project`);
					}
					return func;
				});
			}

			if (!functions || functions.length === 0) {
				throw new SError(`You need to specify either a function path or --all to test all functions`);
			}

			// Set stage and region
			const stages = S.getProject().stages;
			const stagesKeys = Object.keys(stages);
			if (!stagesKeys.length) {
				throw new SError(`We could not find a default stage for your project: it looks like your _meta folder is empty. If you cloned your project using git, try "sls project init" to recreate your _meta folder`);
			}

			const stage = evt.options.stage || stagesKeys[0];
			const stageVariables = stages[stage];

			const region = evt.options.region || Object.keys(stageVariables.regions)[0];

			// Iterate all functions, execute their handler and
			// write the results into a JUnit file...
			const junitWriter = new JUnitWriter();
			let count = 0, succeeded = 0, failed = 0;
			return BbPromise.each(functions, function(functionData) {
				let functionTestSuite = junitWriter.addTestsuite(functionData.name);
				count++;

				if (functionData.runtime.substring(0, 6) === 'nodejs') {

					// TODO Should we skip a function that's explicitly specified via command line option?
					if (functionData.custom.test && functionData.custom.test.skip) {
						SCli.log(`Skipping ${functionData.name}`);
						functionTestSuite.addTestcase('skipped', functionData.name);
						functionTestSuite.setSkipped(true);
						return BbPromise.resolve(); // skip this function
					}

					// Load test event data
					const eventFile = functionData.getRootPath((functionData.custom.test ?
							functionData.custom.test.event : false) || 'event.json');
					const eventData = S.utils.readFileSync(eventFile);

					try {
						// We intercept all stdout from the function and dump
						// it into our test results instead.
						SCli.log(`Testing ${functionData.name}...`);
						let testCase = functionTestSuite.addTestcase('should succeed', functionData.name);
						let capturedText = '';
						let unhookIntercept = intercept(function(txt) {
							// Remove all ANSI color codes from output
							const regex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
							capturedText += txt.replace(regex, '');
							return ''; // don't print anything
						});

						// Finally run the Lambda function...
						let startTime = Date.now();
						return functionData.run(stage, region, eventData)
						.then(function(result) {
							let duration = (Date.now() - startTime) / 1000;
							unhookIntercept(); // stop intercepting stdout

							testCase.setSystemOut(capturedText);
							testCase.setTime(duration);

							if (!result || result.status !== "success") {
								let msg = result.error.toString();
								testCase.addFailure(msg, "Failed");

								SCli.log(chalk.bgRed.white(" ERROR ") + " " +
										chalk.red(msg));
								failed++;
							}
							else if (duration > functionData.timeout) {
								let msg = `Timeout of ${functionData.timeout} seconds exceeded`;
								testCase.addFailure(msg, "Timeout");

								SCli.log(chalk.bgMagenta.white(" TIMEOUT ") + " " + 
										chalk.magenta(msg));
								failed++;
							}
							else {
								// Done.
								SCli.log(chalk.green("Success!"));
								succeeded++;
							}
						})
						.catch(function(err) {
							unhookIntercept(); // stop intercepting stdout

							let msg = err.toString();
							testCase.addFailure(msg, "Failed");

							// Done with errors.
							SCli.log(chalk.bgRed.white(" ERROR ") + " " +
									chalk.red(msg));
							failed++;
						});
					}
					catch (err) {

						SCli.log("-----------------");

						SCli.log(chalk.bold("Failed to Run Handler - This Error Was Thrown:"));
						SCli.log(err);
						evt.data.result.status   = 'error';
						evt.data.result.response = err.message;
					}
				}
				else {
					SCli.log("Skipping " + functionData.name);
					functionTestSuite.setSkipped(true);
				}
			})
			.then(function() {

				SCli.log("-----------------");

				// All done. Print a summary and write the test results
				SCli.log("Tests completed: " + 
						chalk.green(String(succeeded) + " succeeded") + " / " +
						chalk.red(String(failed) + " failed") + " / " + 
						chalk.white(String(count - succeeded - failed) + " skipped"));

				if (evt.options.out) {
					// Write test results to file
					return new BbPromise(function(resolve) {
						junitWriter.save(evt.options.out, function() {
							SCli.log("Test results written to " + evt.options.out);
							resolve();
						});
					});
				}
			})
			.then(function() {
				process.exit(failed > 0 ? 1 : 0); // FIXME force exit
			})
			.catch(function(err) {

				SCli.log("-----------------");

				SCli.log(chalk.bold("Failed to Run Tests - This Error Was Thrown:"));
				SCli.log(err);
				evt.data.result.status   = 'error';
				evt.data.result.response = err.message;
			})
			.finally(function() {
				process.env.SERVERLESS_TEST = undefined;
			});
		}

	}

	// Export Plugin Class
	return ServerlessTestPlugin;

};
