let fs = require('fs');
let child_process = require('child_process');
let os = require('os');
let path = require('path');

module.exports = (options) => {
	let modules = {};
	let printer_helper = null;
	let module_path = path.join(__dirname, './binding/node_printer.node');
	let external_module_path = (options.module) ? path.resolve(options.module) : null;

	/*
	 * TODO: Perhaps bundle precompiled modules?
    let precompiled_path = path.join(__dirname, './precompiled/node_printer_' +
    	process.versions.modules + '_' + process.platform + '_' + process.arch + '.node');
	 */

	if(fs.existsSync(external_module_path)) {
		printer_helper = require(external_module_path);
	} else {
		printer_helper = require(module_path);
	}

	if(!printer_helper) {
		error(Error("A compiled module for your OS, architecture and Node ABI is required."));
	}

	/*
	 * Return all installed printers including active jobs
	 */
	modules.getPrinters = () => {
    	let printers = printer_helper.getPrinters();

    	if(printers && printers.length) {
        	let i = printers.length;
        	for (i in printers) {
            	modules.correctPrinterinfo(printers[i]);
        	}
    	}

		return printers;
	};

	/*
	 * Print raw data. This function is intend to be asynchronous
	 *
	 * Parameters:
	 *
	 * parameters - Object, parameters objects with the following structure:
	 * data - String, mandatory, data to printer
	 * printer - String, optional, name of the printer, if missing, will try to print to default printer
	 * docname - String, optional, name of document showed in printer status
	 * type - String, optional, only for wind32, data type, one of the RAW, TEXT
	 * options - JS object with CUPS options, optional
	 * success - Function, optional, callback function
	 * error - Function, optional, callback function if exists any error
	 *
	 * or
	 *
	 * data - String, mandatory, data to printer
	 * printer - String, optional, name of the printer, if missing, will try to print to default printer
	 * docname - String, optional, name of document showed in printer status
	 * type - String, optional, data type, one of the RAW, TEXT
	 * options - JS object with CUPS options, optional
	 * success - Function, optional, callback function with first argument job_id
	 * error - Function, optional, callback function if exists any error
	 *
	 */
 	modules.printDirect = (parameters) => {
	    let data = parameters;
	    let printer;
	    let docname;
	    let type;
	    let options;
	    let success;
	    let error;

		// TO DO: Rework this. Currently forcing parameters as an object
		// until we can sort out better parameter handling (or scrap it).
		/*
	    if(arguments.length == 1) {
	        // TODO: check parameters type
	        // if(typeof parameters)
	        data = parameters.data;
	        printer = parameters.printer;
	        docname = parameters.docname;
	        type = parameters.type;
	        options = parameters.options || {};
	        success = parameters.success;
	        error = parameters.error;
	    } else {
	        printer = arguments[1];
	        type = arguments[2];
	        docname = arguments[3];
	        options = arguments[4];
	        success = arguments[5];
	        error = arguments[6];
	    }*/

	    data = parameters.data;
	    printer = parameters.printer;
	    docname = parameters.docname;
	    type = parameters.type;
	    options = parameters.options || {};
	    success = parameters.success;
	    error = parameters.error;

	    if(!type) {
	        type = "RAW";
	    }

		// Set default printer name
	    if(!printer) {
	        printer = modules.getDefaultPrinterName();
	    }

	    type = type.toUpperCase();

	    if(!docname) {
	        docname = "node print job";
	    }

	    if(!options) {
	        options = {};
	    }

		// TODO: check parameters type
	    if(printer_helper.printDirect) {
		    // call C++ binding
	        try {
	            var res = printer_helper.printDirect(data, printer, docname, type, options);
	            if(res) {
	                success(res);
	            } else {
	                error(Error("Something wrong in printDirect"));
	            }
	        } catch (e) {
	            error(e);
	        }
	    } else {
	        error("Not supported");
	    }
	};

	/*
	 * Send file to printer.
	 *
	 * Parameters:
	 * parameters - Object, parameters objects with the following structure:
	 * filename - String, mandatory, data to printer
	 * docname - String, optional, name of document showed in printer status
	 * printer - String, optional, mane of the printer, if missed, will try to retrieve the default printer name
	 * success - Function, optional, callback function
	 * error - Function, optional, callback function if exists any error
	 *
	 */
	modules.printFile = (parameters) => {
	    let filename;
	    let docname;
	    let printer;
	    let options;
	    let success;
	    let error;

	    if((arguments.length !== 1) || (typeof(parameters) !== 'object')) {
	        throw new Error('must provide arguments object');
	    }

	    filename = parameters.filename;
	    docname = parameters.docname;
	    printer = parameters.printer;
	    options = parameters.options || {};
	    success = parameters.success;
	    error = parameters.error;

	    if(!success) {
	        success = function () {};
	    }

	    if(!error) {
	        error = function (err) {
	            throw err;
	        };
	    }

	    if(!filename) {
	        let err = new Error('must provide at least a filename');
	        return error(err);
	    }

	    // Try to define default printer name
	    if(!printer) {
	        printer = modules.getDefaultPrinterName();
	    }

	    if(!printer) {
	        return error(new Error('Printer parameter of default printer is not defined'));
	    }

	    // Set filename if docname is missing
	    if(!docname) {
	        docname = filename;
	    }

	    // TODO: check parameters type
	    if(printer_helper.printFile) { // call C++ binding
	        try {
	            // TODO: proper success/error callbacks from the extension
	            let res = printer_helper.printFile(filename, docname, printer, options);

	            if(!isNaN(parseInt(res))) {
	                success(res);
	            } else {
	                error(Error(res));
	            }
	        } catch (e) {
	            error(e);
	        }
	    } else {
	        error("Not supported");
	    }
	};

	/*
	 * Get supported print format for printDirect
	 */
	module.exports.getSupportedPrintFormats = printer_helper.getSupportedPrintFormats;

	/*
	 * Get possible job command for setJob. It depends on os.
	 * @return Array of string. e.g.: DELETE, PAUSE, RESUME
	 */
	module.exports.getSupportedJobCommands = printer_helper.getSupportedJobCommands;

	/*
	 * Get printer info with jobs
	 *
	 * @param printerName printer name to extract the info
	 * @return printer object info:
	 *
	 * TODO: to enum all possible attributes
	 */
	modules.getPrinter = (printerName) => {
		if(!printerName) {
	        printerName = modules.getDefaultPrinterName();
	    }
	    let printer = printer_helper.getPrinter(printerName);
	    modules.correctPrinterinfo(printer);

	    return printer;
	};

	/*
	 * Finds selected paper size pertaining to the specific printer out of all
	 * supported ones in driver_options
	 *
	 * @param printerName printer name to extract the info (default printer used if printer is not provided)
	 * @return selected paper size
	 */
	modules.getSelectedPaperSize = (printerName) => {
    	let driver_options = modules.getPrinterDriverOptions(printerName);
    	let selectedSize = '';

    	if(driver_options && driver_options.PageSize) {
        	Object.keys(driver_options.PageSize).forEach((key) => {
            	if(driver_options.PageSize[key]) {
	            	selectedSize = key;
            	}
        	});
    	}

		return selectedSize;
	};

	/*
	 * Get printer driver options includes advanced options like supported paper size
	 *
	 * @param printerName printer name to extract the info (default printer used if printer is not provided)
	 * @return printer driver info:
	 */
	modules.getPrinterDriverOptions = (printerName) => {
	    if(!printerName) {
	        printerName = modules.getDefaultPrinterName();
	    }

	    return printer_helper.getPrinterDriverOptions(printerName);
	};

	/*
	 * Return user defined printer, according to
	 * https://www.cups.org/documentation.php/doc-2.0/api-cups.html#cupsGetDefault2:
	 * "Applications should use the cupsGetDests and cupsGetDest functions to get the user-defined default printer,
	 * as this function does not support the lpoptions-defined default printer"
	 */
	modules.getDefaultPrinterName = () => {
		let printerName = printer_helper.getDefaultPrinterName();

		if(printerName) {
			return printerName;
  		}

  		// Seems correct posix behaviour
  		let printers = modules.getPrinters();
  		if(printers && printers.length) {
	  		for(printers.length in printers) {
		  		let printer = printers[i];
		  		if(printer.isDefault === true) {
		  			return printer.name;
        		}
    		}
    	}

		// Printer not found, return nothing(undefined)
	};

	/*
	 * Correct printer information
	 */
	modules.correctPrinterinfo = (printer) => {
    	if(printer.status || !printer.options || !printer.options['printer-state']) {
        	return;
    	}

		let status = printer.options['printer-state'];

		// Add posix status
		if(status == '3') {
        	status = 'IDLE'
    	} else if(status == '4') {
        	status = 'PRINTING'
    	} else if(status == '5') {
        	status = 'STOPPED'
    	}

		// Correct date type
		let k;
		for(k in printer.options) {
        	if(/time$/.test(k) && printer.options[k] && !(printer.options[k] instanceof Date)) {
            	printer.options[k] = new Date(printer.options[k] * 1000);
        	}
    	}

		printer.status = status;
	};

	/*
	 * Get printer job info object
	 */
	modules.getJob = (printerName, jobId) => {
    	return printer_helper.getJob(printerName, jobId);
	};

	/*
	 * Set printer job info object
	 */
	modules.setJob = (printerName, jobId, command) => {
    	return printer_helper.setJob(printerName, jobId, command);
	};

	return modules;
}
