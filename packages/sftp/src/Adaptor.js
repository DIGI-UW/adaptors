import {
  execute as commonExecute,
  composeNextState,
  parseCsv,
} from '@openfn/language-common';
import Client from 'ssh2-sftp-client';
import { isObjectEmpty, handleResponse } from './Utils';
import { Readable } from 'stream';


let sftp = null;

/**
 * Execute a sequence of operations with automatic connection management.
 * Wraps `language-common/execute`, and prepends initial state for sftp.
 * @example
 * execute(
 *   list('/some/path/'),
 *   getCSV('/data.csv')
 * )(state)
 * @public
 * @param {Operations} operations - Operations to be performed.
 * @returns {Operation}
 */
export function execute(...operations) {
  const initialState = {
    references: [],
    data: null,
  };

  return state =>
    commonExecute(
      connect,
      ...operations,
      disconnect
    )({ ...initialState, ...state }).catch(e => {
      console.error('❌ SFTP: execute encountered error:', e.message);
      console.log('🔄 SFTP: Attempting emergency disconnection...');
      
      try {
        disconnect(state);
        console.log('✅ SFTP: Emergency disconnection completed');
      } catch (cleanupError) {
        console.warn('⚠️  SFTP: Error during emergency disconnection:', cleanupError.message);
        // Force cleanup
        if (sftp) {
          try {
            sftp.end();
            sftp = undefined;
            console.log('🔧 SFTP: Forced cleanup completed');
          } catch (forceError) {
            console.warn('⚠️  SFTP: Force cleanup also failed:', forceError.message);
            sftp = undefined;
          }
        }
      }
      
      throw e;
    });
}

/**
 * Execute a sequence of operations with manual connection management.
 * Use this when you want to control SFTP connection/disconnection manually within your job.
 * @example
 * executeManual(
 *   connect,
 *   list('/some/path/'),
 *   getCSV('/data.csv'),
 *   disconnect
 * )(state)
 * @public
 * @param {Operations} operations - Operations to be performed.
 * @returns {Operation}
 */
export function executeManual(...operations) {
  const initialState = {
    references: [],
    data: null,
  };

  return state =>
    commonExecute(
      ...operations
    )({ ...initialState, ...state }).catch(e => {
      console.error('❌ SFTP: executeManual encountered error:', e.message);
      
      // Attempt graceful cleanup if still connected
      if (sftp) {
        try {
          const isConnected = sftp.sftp && sftp.sftp.state === 'ready';
          if (isConnected) {
            console.log('🔄 SFTP: Attempting graceful disconnection due to error...');
            sftp.end();
            console.log('✅ SFTP: Emergency disconnection completed');
          } else {
            console.log('ℹ️  SFTP: Connection already closed, no cleanup needed');
          }
        } catch (cleanupError) {
          console.warn('⚠️  SFTP: Error during emergency cleanup:', cleanupError.message);
          // Force cleanup
          try {
            sftp = undefined;
            console.log('🔧 SFTP: Forced cleanup completed');
          } catch (forceError) {
            console.warn('⚠️  SFTP: Force cleanup also failed:', forceError.message);
          }
        } finally {
          sftp = undefined;
        }
      } else {
        console.log('ℹ️  SFTP: No active connection to clean up');
      }
      
      throw e;
    });
}

/**
 * Connect to SFTP server
 * @public
 * @example
 * executeManual(
 *   connect,
 *   list('/some/path/'),
 *   disconnect
 * )(state)
 * @function
 * @returns {Operation}
 */
export function connect(state) {
  console.log('🔗 SFTP: Initializing connection...');

  if (sftp && sftp.sftp) {
    console.log('⚠️  SFTP: Connection already exists, closing previous connection');
    try {
      sftp.end();
    } catch (e) {
      console.warn('⚠️  SFTP: Error closing previous connection:', e.message);
    }
  }
  
  sftp = new Client();

  // Clean configuration to handle URI schemes
  const cleanedConfig = { ...state.configuration };
  
  // Remove URI scheme from host if present
  if (cleanedConfig.host && typeof cleanedConfig.host === 'string') {
    const originalHost = cleanedConfig.host;
    cleanedConfig.host = cleanedConfig.host.replace(/^(sftp|ftp):\/\//, '');
    if (originalHost !== cleanedConfig.host) {
      console.log(`🔧 SFTP: Cleaned host URI '${originalHost}' → '${cleanedConfig.host}'`);
    }
  }
  
  // Validate required configuration
  if (!cleanedConfig.host) {
    const error = new Error('SFTP connection failed: host is required in configuration');
    console.error('❌ SFTP:', error.message);
    throw error;
  }
  
  const connectionInfo = {
    host: cleanedConfig.host,
    port: cleanedConfig.port || 22,
    username: cleanedConfig.username || 'anonymous'
  };
  
  console.log('🔗 SFTP: Attempting connection to:', connectionInfo);
  console.log('🔗 SFTP: Connection timeout: 10000ms');

  const connectConfig = {
    ...cleanedConfig,
    readyTimeout: 100000, // 10 second timeout
    retries: 1
  };

  return sftp.connect(connectConfig).then(() => {
    console.log('✅ SFTP: Successfully connected to', `${connectionInfo.host}:${connectionInfo.port}`);
    console.log('✅ SFTP: Connection ready for operations');
    return state;
  }).catch(error => {
    console.error('❌ SFTP: Connection failed to', `${connectionInfo.host}:${connectionInfo.port}`);
    console.error('❌ SFTP: Error details:', error.message);
    console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
    
    // Provide helpful error context
    if (error.code === 'ENOTFOUND') {
      console.error('💡 SFTP: DNS lookup failed - check host address');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('💡 SFTP: Connection refused - check port and firewall');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('💡 SFTP: Connection timeout - check network connectivity');
    } else if (error.message.includes('authentication')) {
      console.error('💡 SFTP: Authentication failed - check username/password');
    }
    
    const enhancedError = new Error(`SFTP connection failed to ${connectionInfo.host}:${connectionInfo.port}: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.connectionInfo = connectionInfo;
    throw enhancedError;
  });
}

/**
 * Disconnect from SFTP server
 * @public
 * @example
 * executeManual(
 *   connect,
 *   list('/some/path/'),
 *   disconnect
 * )(state)
 * @function
 * @returns {Operation}
 */
export function disconnect(state) {
  console.log('🔌 SFTP: Disconnecting...');
  
  if (!sftp) {
    console.log('ℹ️  SFTP: No active connection to disconnect');
    return state;
  }
  
  try {
    sftp.end();
    console.log('✅ SFTP: Successfully disconnected');
  } catch (error) {
    console.warn('⚠️  SFTP: Error during disconnection:', error.message);
    // Don't throw on disconnect errors, just warn
  } finally {
    sftp = undefined;
  }
  
  return state;
}

/**
 * List files present in a directory
 * @public
 * @example
 * <caption>basic files listing</caption>
 * list('/some/path/')
 * @example
 * <caption>list files with filters</caption>
 * list('/some/path/', file=> {
 *  return /foo.\.txt/.test(file.name);
 * })
 * @example
 * <caption>list files with filters and use callback</caption>
 * list(
 *   "/some/path/",
 *   (file) => /foo.\.txt/.test(file.name),
 *   (state) => {
 *     const latestFile = state.data.filter(
 *       (file) => file.modifyTime <= new Date()
 *     );
 *     return { ...state, latestFile };
 *   }
 * );
 * @function
 * @param {string} dirPath - Path to remote directory
 * @param {function} filter - a filter function used to select return entries
 * @param {function} [callback] - Optional callback to handle the response
 * @returns {Operation}
 */
export function list(dirPath, filter, callback) {
  return state => {
    console.log('📂 SFTP: Starting directory listing...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before list()');
      throw error;
    }
    
    // Validate directory path
    if (!dirPath || typeof dirPath !== 'string') {
      const error = new Error('SFTP list failed: dirPath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Provided dirPath:', dirPath);
      throw error;
    }
    
    console.log('📂 SFTP: Listing directory:', dirPath);
    if (filter && typeof filter === 'function') {
      console.log('🔍 SFTP: Filter function provided');
    }
    
    const startTime = Date.now();
    
    return sftp
      .list(dirPath, filter)
      .then(files => {
        const duration = Date.now() - startTime;
        console.log('✅ SFTP: Directory listing completed in', `${duration}ms`);
        console.log('📊 SFTP: Found', files.length, 'items');
        
        if (files.length > 0) {
          console.log('📋 SFTP: First few items:');
          files.slice(0, 3).forEach((file, index) => {
            const type = file.type === 'd' ? '📁' : '📄';
            const size = file.type === 'd' ? '' : ` (${file.size} bytes)`;
            console.log(`  ${index + 1}. ${type} ${file.name}${size}`);
          });
          if (files.length > 3) {
            console.log(`  ... and ${files.length - 3} more items`);
          }
        } else {
          console.log('📭 SFTP: Directory is empty');
        }
        
        return handleResponse(files, state, callback);
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        console.error('❌ SFTP: Directory listing failed after', `${duration}ms`);
        console.error('❌ SFTP: Directory path:', dirPath);
        console.error('❌ SFTP: Error details:', error.message);
        console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
        
        // Provide helpful error context
        if (error.code === 'ENOENT' || error.message.includes('No such file')) {
          console.error('💡 SFTP: Directory not found - check the path exists');
        } else if (error.code === 'EACCES' || error.message.includes('permission')) {
          console.error('💡 SFTP: Permission denied - check directory permissions');
        } else if (error.message.includes('not connected')) {
          console.error('💡 SFTP: Connection lost - try reconnecting');
        }
        
        const enhancedError = new Error(`SFTP list operation failed for '${dirPath}': ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.dirPath = dirPath;
        enhancedError.operation = 'list';
        throw enhancedError;
      });
  };
}

/**
 * Get a file from SFTP server
 * @public
 * @example
 * get('/path/to/file.txt')
 * @example
 * get('/path/to/file.xlsx', '/local/path/file.xlsx')
 * @function
 * @param {string} filePath - Path to remote file
 * @param {string} [localPath] - Optional local path to save file (if not provided, returns file content)
 * @returns {Operation}
 */
export function get(filePath, localPath = null) {
  return state => {
    console.log('📄 SFTP: Starting file download...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before get()');
      throw error;
    }
    
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      const error = new Error('SFTP get failed: filePath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Provided filePath:', filePath);
      throw error;
    }
    
    console.log('📄 SFTP: Downloading file:', filePath);
    if (localPath) {
      console.log('📄 SFTP: Saving to local path:', localPath);
    } else {
      console.log('📄 SFTP: Returning file content in memory');
    }
    
    const startTime = Date.now();
    
    if (localPath) {
      // Download to local file
      return sftp
        .get(filePath, localPath)
        .then(() => {
          const duration = Date.now() - startTime;
          console.log('✅ SFTP: File downloaded to local path in', `${duration}ms`);
          console.log('📁 SFTP: Local file:', localPath);
          
          return {
            ...state,
            data: {
              filePath,
              localPath,
              downloadTime: new Date().toISOString(),
              status: 'downloaded'
            }
          };
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          console.error('❌ SFTP: File download failed after', `${duration}ms`);
          console.error('❌ SFTP: File path:', filePath);
          console.error('❌ SFTP: Local path:', localPath);
          console.error('❌ SFTP: Error details:', error.message);
          console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
          
          // Provide helpful error context
          if (error.code === 'ENOENT' || error.message.includes('No such file')) {
            console.error('💡 SFTP: File not found - check the file path exists');
          } else if (error.code === 'EACCES' || error.message.includes('permission')) {
            console.error('💡 SFTP: Permission denied - check file permissions');
          } else if (error.message.includes('not connected')) {
            console.error('💡 SFTP: Connection lost - try reconnecting');
          }
          
          const enhancedError = new Error(`SFTP file download failed for '${filePath}': ${error.message}`);
          enhancedError.originalError = error;
          enhancedError.filePath = filePath;
          enhancedError.localPath = localPath;
          enhancedError.operation = 'get';
          throw enhancedError;
        });
    } else {
      // Download to memory
      return sftp
        .get(filePath)
        .then(buffer => {
          const duration = Date.now() - startTime;
          console.log('✅ SFTP: File download completed in', `${duration}ms`);
          console.log('📊 SFTP: Total file size:', buffer.length, 'bytes');
          
          return {
            ...state,
            data: {
              filePath,
              content: buffer,
              size: buffer.length,
              downloadTime: new Date().toISOString(),
              status: 'downloaded'
            }
          };
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          console.error('❌ SFTP: File download failed after', `${duration}ms`);
          console.error('❌ SFTP: File path:', filePath);
          console.error('❌ SFTP: Error details:', error.message);
          console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
          
          // Provide helpful error context
          if (error.code === 'ENOENT' || error.message.includes('No such file')) {
            console.error('💡 SFTP: File not found - check the file path exists');
          } else if (error.code === 'EACCES' || error.message.includes('permission')) {
            console.error('💡 SFTP: Permission denied - check file permissions');
          } else if (error.message.includes('not connected')) {
            console.error('💡 SFTP: Connection lost - try reconnecting');
          }
          
          const enhancedError = new Error(`SFTP file download failed for '${filePath}': ${error.message}`);
          enhancedError.originalError = error;
          enhancedError.filePath = filePath;
          enhancedError.operation = 'get';
          throw enhancedError;
        });
    }
  };
}

/**
 * Get a CSV and return a JSON array of strings for each item separated by the delimiter
 * @public
 * @example
 * getCSV(
 *   '/some/path/to_file.csv',
 *   {delimiter: ";", flatKeys: true }
 * );
 * @function
 * @param {string} filePath - Path to resource
 * @param {{readStreamOptions: object,delimiter: string,noheader: boolean, quote: string, trim: boolean, flatKeys: boolean, output: string}} [parsingOptions] - Optional. `parsingOptions` Parsing options which can be passed to convert csv to json See more {@link https://github.com/Keyang/node-csvtojson#parameters on csvtojson docs}
 * @returns {Operation}
 */
export function getCSV(filePath, parsingOptions = {}) {
  const defaultOptions = {
    readStreamOptions: {
      encoding: null,
      autoClose: false,
    },
    columns: true,
  };

  return state => {
    console.log('📄 SFTP: Starting CSV download...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before getCSV()');
      throw error;
    }
    
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      const error = new Error('SFTP getCSV failed: filePath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Provided filePath:', filePath);
      throw error;
    }
    
    console.log('📄 SFTP: Downloading CSV file:', filePath);
    
    let results = [];
    const startTime = Date.now();

    const { readStreamOptions, ...csvDefaultOptions } = defaultOptions;
    const useParser = !isObjectEmpty(parsingOptions);
    
    if (useParser) {
      console.log('🔧 SFTP: Using CSV parser with options:', parsingOptions);
    } else {
      console.log('🔧 SFTP: Using simple CSV processing');
    }

    if (useParser) {
      const stream = sftp.createReadStream(filePath, readStreamOptions);
      return parseCsv(stream, { ...csvDefaultOptions, ...parsingOptions })(
        state
      ).catch(error => {
        const duration = Date.now() - startTime;
        console.error('❌ SFTP: CSV parsing failed after', `${duration}ms`);
        console.error('❌ SFTP: File path:', filePath);
        console.error('❌ SFTP: Error details:', error.message);
        
        const enhancedError = new Error(`SFTP CSV parsing failed for '${filePath}': ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.filePath = filePath;
        enhancedError.operation = 'getCSV';
        enhancedError.parsingOptions = parsingOptions;
        throw enhancedError;
      });
    } else {
      return sftp
        .get(filePath)
        .then(buffer => {
          const duration = Date.now() - startTime;
          console.log('✅ SFTP: File download completed in', `${duration}ms`);
          console.log('🔧 SFTP: Parsing CSV content...');
          
          return new Promise((resolve, reject) => {
            try {
              const content = buffer.toString('utf8');
              console.log('📊 SFTP: CSV content size:', content.length, 'characters');
              
              const lines = content.split('\r\n');
              console.log('📊 SFTP: CSV lines count:', lines.length);
              
              resolve(lines);
            } catch (error) {
              console.error('❌ SFTP: CSV content parsing failed:', error.message);
              reject(error);
            }
          }).then(json => {
            console.log('✅ SFTP: CSV parsing completed successfully');
            
            const nextState = composeNextState(state, json);
            return nextState;
          });
        })
        .then(state => {
          const totalDuration = Date.now() - startTime;
          console.log('🎉 SFTP: CSV operation completed in', `${totalDuration}ms`);
          return state;
        })
        .catch(error => {
          const duration = Date.now() - startTime;
          console.error('❌ SFTP: CSV download failed after', `${duration}ms`);
          console.error('❌ SFTP: File path:', filePath);
          console.error('❌ SFTP: Error details:', error.message);
          console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
          
          // Provide helpful error context
          if (error.code === 'ENOENT' || error.message.includes('No such file')) {
            console.error('💡 SFTP: File not found - check the file path exists');
          } else if (error.code === 'EACCES' || error.message.includes('permission')) {
            console.error('💡 SFTP: Permission denied - check file permissions');
          } else if (error.message.includes('not connected')) {
            console.error('💡 SFTP: Connection lost - try reconnecting');
          }
          
          const enhancedError = new Error(`SFTP CSV download failed for '${filePath}': ${error.message}`);
          enhancedError.originalError = error;
          enhancedError.filePath = filePath;
          enhancedError.operation = 'getCSV';
          enhancedError.parsingOptions = parsingOptions;
          throw enhancedError;
        });
    }
  };
}

/**
 * Convert JSON to CSV and upload to an FTP server
 * @public
 * @example
 * putCSV(
 *   '/some/path/to_local_file.csv',
 *   '/some/path/to_remove_file.csv',
 *   { delimiter: ';', noheader: true }
 * );
 * @function
 * @param {string} localFilePath -  Data source for data to copy to the remote server.
 * @param {string} remoteFilePath - Path to the remote file to be created on the server.
 * @param {object} parsingOptions - Options which can be passed to adjust the read and write stream used in sending the data to the remote server
 * @returns {Operation}
 */
export function putCSV(localFilePath, remoteFilePath, parsingOptions) {
  return state => {
    return sftp
      .put(localFilePath, remoteFilePath, parsingOptions)
      .then(response => handleResponse(response, state))
      .then(state => {
        return state;
      });
  };
}

/**
 * Fetch a json file from an FTP server
 * @public
 * @example
 * getJSON(
 *   '/path/To/File',
 *   'utf8',
 * );
 * @function
 * @param {string} filePath - Path to resource
 * @param {string} encoding - Character encoding for the json
 * @returns {Operation}
 */
export function getJSON(filePath, encoding) {
  return state => {
    let results = [];

    return sftp
      .get(filePath)
      .then(chunk => {
        results.push(chunk);
      })
      .then(() => {
        console.debug('Receiving stream.\n');

        return new Promise((resolve, reject) => {
          const content = Buffer.concat(results).toString('utf8');
          resolve(content.split('\r\n'));
        }).then(json => {
          const nextState = composeNextState(state, json);
          return nextState;
        });
      })
      .then(state => {
        return state;
      });
  };
}

export function getFile(filePath) {
  console.log('🔍 SFTP: getFile called with filePath:', filePath);
  
  return state => {
    console.log('🔍 SFTP: getFile state function called');
    let results = [];

    return sftp
      .get(filePath)
      .then(chunk => {
        console.log('✅ SFTP: File download completed');
        console.log('📊 SFTP: Chunk size:', chunk.length, 'bytes');
        results.push(chunk);
      })
      .then(() => {
        console.log('📊 SFTP: Total file size:', results.length > 0 ? results[0].length : 0, 'bytes');
        
        return new Promise((resolve, reject) => {
          const content = results[0]; // Just get the first chunk since we're not streaming
          resolve({
            filePath: filePath,
            content: content,
            size: content.length,
            timestamp: new Date().toISOString()
          });
        }).then(fileData => {
          const nextState = composeNextState(state, fileData);
          return nextState;
        });
      })
      .then(state => {
        console.log('✅ SFTP: getExcelFile completed successfully');
        return state;
      })
      .catch(error => {
        console.log('❌ SFTP: getExcelFile failed:', error.message);
        return {
          ...state,
          data: {
            error: 'File download failed: ' + error.message,
            filePath: filePath
          }
        };
      });
  };
}

/**
 * Fetch an Excel (XLSX) file from an SFTP server and parse it in memory-efficient chunks
 * @public
 * @example
 * getXLSX(
 *   '/path/to/file.xlsx',
 *   { sheetName: 'Sheet1', withHeader: true, chunkSize: 1000, maxRows: 100 }
 * );
 * @function
 * @param {string} filePath - Path to the Excel file on the SFTP server
 * @param {object} parsingOptions - Options for parsing the Excel file
 * @param {string} parsingOptions.sheetName - Name of the sheet to read (default: first sheet)
 * @param {boolean} parsingOptions.withHeader - Use first row as headers (default: true)
 * @param {boolean} parsingOptions.ignoreEmpty - Ignore empty rows (default: true)
 * @param {number} parsingOptions.chunkSize - Number of rows to process at once (default: 1000)
 * @param {number} parsingOptions.maxRows - Maximum number of rows to read (default: undefined)
 * @returns {Operation}
 */
export function getXLSX(filePath, parsingOptions = {}) {
  const defaultOptions = {
    sheetName: null,
    withHeader: true,
    ignoreEmpty: true,
    chunkSize: 10000,
    maxRows: undefined,
  };
  const options = { ...defaultOptions, ...parsingOptions };

  return state => {
    console.log('📄 SFTP: Starting Excel file download...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before getXLSX()');
      throw error;
    }
    
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      const error = new Error('SFTP getXLSX failed: filePath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Provided filePath:', filePath);
      throw error;
    }
    
    console.log('📄 SFTP: Downloading Excel file:', filePath);
    console.log('🔧 SFTP: Processing options:', options);
    
    const startTime = Date.now();
    
    return sftp
      .get(filePath)
      .then(buffer => {
        const duration = Date.now() - startTime;
        console.log('✅ SFTP: Excel file download completed in', `${duration}ms`);
        console.log('📊 SFTP: Total file size:', buffer.length, 'bytes');
        
        // Validate buffer
        if (!buffer || buffer.length === 0) {
          throw new Error('Downloaded file is empty or invalid');
        }
        
        // Check if it's actually an Excel file by looking at file signature
        const fileSignature = buffer.slice(0, 4).toString('hex');
        console.log('🔍 SFTP: File signature:', fileSignature);
        
        // Excel files should start with PK (ZIP signature) as they are ZIP archives
        if (!fileSignature.startsWith('504b')) {
          console.warn('⚠️  SFTP: File may not be a valid Excel file (unexpected signature)');
        }
        
        console.log('🔧 SFTP: Processing Excel data with streaming...');
        
        return processExcelDataWithStreaming(buffer, filePath, options);
      })
      .then(result => {
        console.log('✅ SFTP: Excel processing completed successfully');
        console.log('📊 SFTP: Processed rows:', result.totalRows);
        console.log('📊 SFTP: Data length:', result.data ? result.data.length : 0);
        
        // Validate result
        if (!result.data || result.data.length === 0) {
          console.warn('⚠️  SFTP: No data extracted from Excel file');
          console.warn('⚠️  SFTP: This might indicate an empty file or parsing error');
        }
        
        return {
          ...state,
          data: result,
        };
      })
      .then(state => {
        const totalDuration = Date.now() - startTime;
        console.log('🎉 SFTP: Excel operation completed in', `${totalDuration}ms`);
        return state;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        console.error('❌ SFTP: Excel file download failed after', `${duration}ms`);
        console.error('❌ SFTP: File path:', filePath);
        console.error('❌ SFTP: Error details:', error.message);
        console.error('❌ SFTP: Error code:', error.code || 'UNKNOWN');
        console.error('❌ SFTP: Error stack:', error.stack);
        
        // Provide helpful error context
        if (error.code === 'ENOENT' || error.message.includes('No such file')) {
          console.error('💡 SFTP: File not found - check the file path exists');
        } else if (error.code === 'EACCES' || error.message.includes('permission')) {
          console.error('💡 SFTP: Permission denied - check file permissions');
        } else if (error.message.includes('not connected')) {
          console.error('💡 SFTP: Connection lost - try reconnecting');
        } else if (error.message.includes('xlstream') || error.message.includes('stream')) {
          console.error('💡 SFTP: Excel parsing error - check file format and content');
        }
        
        const enhancedError = new Error(`SFTP Excel file download failed for '${filePath}': ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.filePath = filePath;
        enhancedError.operation = 'getXLSX';
        enhancedError.parsingOptions = parsingOptions;
        throw enhancedError;
      });
  };
}

/**
 * Process Excel file data in memory-efficient chunks using xlstream
 * @private
 */
async function processExcelDataWithStreaming(buffer, filePath, options) {
  console.log('🔧 SFTP: Starting processExcelDataWithStreaming...');
  console.log('🔧 SFTP: Buffer size:', buffer.length, 'bytes');
  console.log('🔧 SFTP: Processing options:', options);
  
  // Import modules using dynamic imports for ES module compatibility
  console.log('🔧 SFTP: Importing required modules...');
  
  let xlstreamModule;
  let writeFileSync, unlinkSync, join, tmpdir;
  
  try {
    xlstreamModule = await import('xlstream');
    console.log('✅ SFTP: xlstream module imported successfully');
    console.log('🔧 SFTP: xlstream exports:', Object.keys(xlstreamModule));
    
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const osModule = await import('os');
    
    writeFileSync = fsModule.writeFileSync;
    unlinkSync = fsModule.unlinkSync;
    join = pathModule.join;
    tmpdir = osModule.tmpdir;
    
    console.log('✅ SFTP: All required modules imported successfully');
  } catch (importError) {
    console.error('❌ SFTP: Failed to import required modules:', importError.message);
    throw new Error(`Module import failed: ${importError.message}`);
  }
  
  const { getXlsxStream } = xlstreamModule;
  
  if (!getXlsxStream || typeof getXlsxStream !== 'function') {
    console.error('❌ SFTP: getXlsxStream is not available or not a function');
    console.error('❌ SFTP: Available xlstream exports:', Object.keys(xlstreamModule));
    throw new Error('getXlsxStream function is not available from xlstream module');
  }
  
  console.log('✅ SFTP: getXlsxStream function is available');
  
  // Create a temporary file to work with xlstream
  const tempDir = tmpdir();
  const tempFileName = `excel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`;
  const tempFilePath = join(tempDir, tempFileName);
  
  console.log('🔧 SFTP: Creating temporary file:', tempFilePath);
  
  let tempFileCreated = false;
  
  try {
    // Write buffer to temporary file
    writeFileSync(tempFilePath, buffer);
    tempFileCreated = true;
    console.log('✅ SFTP: Temporary file created successfully');
    console.log('🔧 SFTP: Temporary file size:', buffer.length, 'bytes');
    
    return new Promise(async (resolve, reject) => {
      try {
        const streamOptions = {
          filePath: tempFilePath,
          sheet: options.sheetName || 0,
          withHeader: options.withHeader,
          ignoreEmpty: options.ignoreEmpty,
        };
        
        console.log('🔧 SFTP: Calling getXlsxStream with options:', streamOptions);
        
        // Get the stream using the correct xlstream API
        const stream = await getXlsxStream(streamOptions);
        
        console.log('✅ SFTP: Stream created successfully');
        console.log('🔧 SFTP: Stream type:', typeof stream);
        console.log('🔧 SFTP: Stream is null?', stream === null);
        console.log('🔧 SFTP: Stream is undefined?', stream === undefined);
        
        if (stream) {
          console.log('🔧 SFTP: Stream methods:', Object.getOwnPropertyNames(stream));
          console.log('🔧 SFTP: Stream constructor:', stream.constructor.name);
        }
        
        // Verify stream has required methods
        if (!stream || typeof stream.on !== 'function') {
          console.error('❌ SFTP: Invalid stream object returned from getXlsxStream');
          console.error('❌ SFTP: Stream type:', typeof stream);
          console.error('❌ SFTP: Stream value:', stream);
          
          // Try alternative approach - maybe it's a promise
          if (stream && typeof stream.then === 'function') {
            console.log('🔧 SFTP: Stream appears to be a Promise, awaiting it...');
            try {
              const resolvedStream = await stream;
              console.log('✅ SFTP: Resolved stream type:', typeof resolvedStream);
              
              if (resolvedStream && typeof resolvedStream.on === 'function') {
                console.log('✅ SFTP: Resolved stream is valid, using it...');
                return processStreamData(resolvedStream, options, resolve, reject);
              }
            } catch (resolveError) {
              console.error('❌ SFTP: Failed to resolve stream promise:', resolveError.message);
            }
          }
          
          // Return empty result if stream is invalid
          console.warn('⚠️  SFTP: Returning empty result due to invalid stream');
          return resolve({
            fileName: filePath,
            fileSize: buffer.length,
            chunkSize: options.chunkSize,
            chunksProcessed: 0,
            totalRows: 0,
            data: [],
            metadata: {
              processedAt: new Date().toISOString(),
              processingMethod: 'xlstream',
              withHeader: options.withHeader,
              ignoreEmpty: options.ignoreEmpty,
              actualChunkSize: options.chunkSize,
              maxRows: options.maxRows,
              error: 'Invalid stream object',
            },
          });
        }
        
        // Process the stream
        processStreamData(stream, options, resolve, reject, buffer, filePath);
        
      } catch (error) {
        console.error('❌ SFTP: Error in stream processing:', error.message);
        console.error('❌ SFTP: Error stack:', error.stack);
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('❌ SFTP: Error in processExcelDataWithStreaming:', error.message);
    console.error('❌ SFTP: Error stack:', error.stack);
    throw error;
  } finally {
    // Clean up temporary file
    if (tempFileCreated) {
      try {
        unlinkSync(tempFilePath);
        console.log('✅ SFTP: Temporary file cleaned up successfully');
      } catch (cleanupError) {
        console.warn('⚠️  SFTP: Could not clean up temporary file:', cleanupError.message);
      }
    }
  }
}

/**
 * Process stream data and handle events
 * @private
 */
function processStreamData(stream, options, resolve, reject, buffer, filePath) {
  console.log('🔧 SFTP: Starting stream data processing...');
  
  let allData = [];
  let chunk = [];
  let processedRows = 0;
  let chunksProcessed = 0;
  let finished = false;
  const maxRows = options.maxRows;
  

  console.log(`chunk size: ${options.chunkSize}`)

  // Set up timeout to prevent hanging
  const timeout = setTimeout(() => {
    if (!finished) {
      console.warn('⚠️  SFTP: Stream processing timeout (30 seconds)');
      finished = true;
      stream.destroy();
      resolve({
        fileName: filePath,
        fileSize: buffer ? buffer.length : 0,
        chunkSize: options.chunkSize,
        chunksProcessed,
        totalRows: processedRows,
        data: allData,
        metadata: {
          processedAt: new Date().toISOString(),
          processingMethod: 'xlstream',
          withHeader: options.withHeader,
          ignoreEmpty: options.ignoreEmpty,
          actualChunkSize: options.chunkSize,
          maxRows: options.maxRows,
          timeout: true,
        },
      });
    }
  }, 300000); // 30 second timeout
  
  stream.on('data', row => {
    if (finished) return;
    
    // Log every 1000 rows
    if (processedRows % 10000 === 0) {
      console.log('📊 SFTP: Processing row:', processedRows + 1);
    }
    
    // Log the first 3 rows
    // Log e
    if (processedRows < 3) {
      console.log('📊 SFTP: Sample row data:', row);
    }
    
    chunk.push(row.formatted || row);
    processedRows++;
    
    if (chunk.length >= options.chunkSize) {
      allData = allData.concat(chunk);
      chunk = [];
      chunksProcessed++;
      console.log('📦 SFTP: Completed chunk', chunksProcessed, 'with', options.chunkSize, 'rows');
    }
    
    if (maxRows && processedRows >= maxRows) {
      console.log('🔢 SFTP: Reached max rows limit:', maxRows);
      if (chunk.length > 0) {
        allData = allData.concat(chunk);
        chunk = [];
        chunksProcessed++;
      }
      finished = true;
      stream.destroy();
    }
  });
  
  stream.on('end', () => {
    console.log('✅ SFTP: Stream ended successfully');
    clearTimeout(timeout);
    
    if (!finished && chunk.length > 0) {
      allData = allData.concat(chunk);
      chunksProcessed++;
      console.log('📦 SFTP: Final chunk processed with', chunk.length, 'rows');
    }
    
    console.log('📊 SFTP: Processing complete:');
    console.log('   - Total rows:', processedRows);
    console.log('   - Chunks processed:', chunksProcessed);
    console.log('   - Data length:', allData.length);
    
    resolve({
      fileName: filePath,
      fileSize: buffer ? buffer.length : 0,
      chunkSize: options.chunkSize,
      chunksProcessed,
      totalRows: processedRows,
      data: allData,
      metadata: {
        processedAt: new Date().toISOString(),
        processingMethod: 'xlstream',
        withHeader: options.withHeader,
        ignoreEmpty: options.ignoreEmpty,
        actualChunkSize: options.chunkSize,
        maxRows: options.maxRows,
      },
    });
  });
  
  stream.on('error', err => {
    console.error('❌ SFTP: Stream error:', err.message);
    console.error('❌ SFTP: Stream error stack:', err.stack);
    clearTimeout(timeout);
    
    // Don't reject completely, return partial data if available
    if (processedRows > 0) {
      console.log('⚠️  SFTP: Returning partial data due to stream error');
      if (chunk.length > 0) {
        allData = allData.concat(chunk);
        chunksProcessed++;
      }
      
      resolve({
        fileName: filePath,
        fileSize: buffer ? buffer.length : 0,
        chunkSize: options.chunkSize,
        chunksProcessed,
        totalRows: processedRows,
        data: allData,
        metadata: {
          processedAt: new Date().toISOString(),
          processingMethod: 'xlstream',
          withHeader: options.withHeader,
          ignoreEmpty: options.ignoreEmpty,
          actualChunkSize: options.chunkSize,
          maxRows: options.maxRows,
          error: err.message,
        },
      });
    } else {
      reject(err);
    }
  });
}


/**
 * Convert JSON array of strings into a normalized object
 * @public
 * @example
 * normalizeCSVarray({ delimiter: ';', noheader: true });
 * @function
 * @param {options} options - Options passed to csvtojson parser
 * @param {callback} callback - Options passed to csvtojson parser
 * @returns {Operation}
 */
export function normalizeCSVarray(options, callback) {
  return state => {
    let results = [];

    state.data.map(data => {
      const [keys, ...rest] = data
        .shift()
        .split('\n')
        .map(h => h.replace(/"/g, ''));

      results.push(keys);
    });

    const headers = results[0]
      .trim()
      .split('\n')
      .map(item => item.split(','))
      .flat();

    const values = results[1]
      .trim()
      .split('\n')
      .map(item => item.split(','))
      .flat();

    const normalizedArray = values.map(item => {
      const object = {};
      headers.forEach((key, index) => (object[key] = item.at(index)));
      return object;
    });

    return { ...state, normalizedArray };
  };
}

export * from 'lodash/fp';

export {
  alterState,
  fn,
  fnIf,
  dataPath,
  dataValue,
  each,
  field,
  fields,
  lastReferenceValue,
  merge,
  sourceValue,
  chunk,
  parseCsv,
} from '@openfn/language-common';
