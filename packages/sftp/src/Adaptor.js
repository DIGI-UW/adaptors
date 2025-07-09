import {
  execute as commonExecute,
  composeNextState,
  parseCsv,
} from '@openfn/language-common';
import Client from 'ssh2-sftp-client';
import { isObjectEmpty, handleResponse } from './Utils';

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
    readyTimeout: 10000, // 10 second timeout
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
        .then(chunk => {
          console.log('📥 SFTP: Downloaded chunk of size:', chunk.length, 'bytes');
          results.push(chunk);
        })
        .then(() => {
          const duration = Date.now() - startTime;
          console.log('✅ SFTP: File download completed in', `${duration}ms`);
          console.log('🔧 SFTP: Parsing CSV content...');
          console.time('CSV parsing');
          
          return new Promise((resolve, reject) => {
            try {
              const content = Buffer.concat(results).toString('utf8');
              console.log('📊 SFTP: CSV content size:', content.length, 'characters');
              
              const lines = content.split('\r\n');
              console.log('📊 SFTP: CSV lines count:', lines.length);
              
              resolve(lines);
            } catch (error) {
              console.error('❌ SFTP: CSV content parsing failed:', error.message);
              reject(error);
            }
          }).then(json => {
            console.timeEnd('CSV parsing');
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
    console.time('Upload finished');
    return sftp
      .put(localFilePath, remoteFilePath, parsingOptions)
      .then(response => handleResponse(response, state))
      .then(state => {
        console.timeEnd('Upload finished');
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
        console.time('Stream finished');

        return new Promise((resolve, reject) => {
          const content = Buffer.concat(results).toString('utf8');
          resolve(content.split('\r\n'));
        }).then(json => {
          const nextState = composeNextState(state, json);
          return nextState;
        });
      })
      .then(state => {
        console.timeEnd('Stream finished');
        return state;
      });
  };
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
