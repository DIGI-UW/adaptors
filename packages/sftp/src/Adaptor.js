import {
  execute as commonExecute,
  composeNextState,
  parseCsv,
} from '@openfn/language-common';
import { createHash } from 'crypto';
import Client from 'ssh2-sftp-client';
import { isObjectEmpty, handleResponse } from './Utils';
import { loadState, saveState, deleteState } from './state.js';
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

export const stateStore = {
  load: (namespace, key) => async state => {
    const value = loadState(namespace, key);
    return {
      ...state,
      data: value,
    };
  },
  save: (namespace, key, value) => async state => {
    saveState(namespace, key, value);
    return {
      ...state,
      data: value,
    };
  },
  destroy: (namespace, key) => async state => {
    deleteState(namespace, key);
    return state;
  },
};

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
    readyTimeout: 100000, // 100 second timeout
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
 * Get metadata about an Excel file for chunk processing
 * @public
 * @example
 * getExcelMetadata('/path/to/file.xlsx', 5000)
 * @example
 * getExcelMetadata('/path/to/file.xlsx', 5000, {
 *   columnMapping: {
 *     regions: ['Region', 'region'],
 *     zones: ['Zone', 'zone'],
 *     districts: ['District', 'district'],
 *     sites: ['Site', 'site'],
 *     hsectors: ['hsector', 'health_sector'],
 *     quarters: ['Quarter', 'quarter'],
 *     reportingPeriods: ['Reporting period', 'reporting_period'],
 *     indicators: ['Indicator_name', 'indicator_name']
 *   }
 * })
 * @function
 * @param {string} filePath - Path to the Excel file
 * @param {number} chunkSize - Size of each chunk in rows
 * @param {object} options - Optional parameters including columnMapping
 * @returns {Operation}
 */
export function getExcelMetadata(filePath, chunkSize, options = {}) {
  return state => {
    console.log('📊 SFTP: Getting Excel metadata...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before getExcelMetadata()');
      throw error;
    }
    
    // Validate parameters
    if (!filePath || typeof filePath !== 'string') {
      const error = new Error('SFTP getExcelMetadata failed: filePath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    
    if (!chunkSize || typeof chunkSize !== 'number' || chunkSize <= 0) {
      const error = new Error('SFTP getExcelMetadata failed: chunkSize must be a positive number');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    
    console.log('📄 SFTP: Reading Excel metadata for:', filePath);
    console.log('🔧 SFTP: Chunk size:', chunkSize);
    
    if (options.columnMapping) {
      console.log('🔧 SFTP: Using column mapping for unique value collection');
      console.log('🔧 SFTP: Mapping keys:', Object.keys(options.columnMapping));
    }
    
    const startTime = Date.now();
    
    return sftp
      .get(filePath)
      .then(buffer => {
        const duration = Date.now() - startTime;
        console.log('✅ SFTP: Excel file downloaded in', `${duration}ms`);
        console.log('📊 SFTP: File size:', buffer.length, 'bytes');
        
        return processExcelMetadata(buffer, filePath, chunkSize, options);
      })
      .then(metadata => {
        console.log('✅ SFTP: Excel metadata processing completed');
        console.log('📊 SFTP: Total rows:', metadata.totalRows);
        console.log('📊 SFTP: Total chunks:', metadata.totalChunks);
        
        return {
          ...state,
          data: metadata,
        };
      })
      .then(state => {
        const totalDuration = Date.now() - startTime;
        console.log('🎉 SFTP: Excel metadata operation completed in', `${totalDuration}ms`);
        return state;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        console.error('❌ SFTP: Excel metadata failed after', `${duration}ms`);
        console.error('❌ SFTP: File path:', filePath);
        console.error('❌ SFTP: Error details:', error.message);
        
        const enhancedError = new Error(`SFTP Excel metadata failed for '${filePath}': ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.filePath = filePath;
        enhancedError.operation = 'getExcelMetadata';
        throw enhancedError;
      });
  };
}

/**
 * Get a specific chunk of rows from an Excel file
 * @public
 * @example
 * getExcelChunk('/path/to/file.xlsx', 0, 5000)
 * @function
 * @param {string} filePath - Path to the Excel file
 * @param {number} chunkIndex - Index of the chunk to retrieve (0-based)
 * @param {number} chunkSize - Size of each chunk in rows
 * @returns {Operation}
 */
export function getExcelChunk(filePath, chunkIndex, chunkSize) {
  return state => {
    console.log('📦 SFTP: Getting Excel chunk...');
    
    // Validate connection
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      console.error('💡 SFTP: Make sure to call connect() before getExcelChunk()');
      throw error;
    }
    
    // Validate parameters
    if (!filePath || typeof filePath !== 'string') {
      const error = new Error('SFTP getExcelChunk failed: filePath must be a non-empty string');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    
    if (typeof chunkIndex !== 'number' || chunkIndex < 0) {
      const error = new Error('SFTP getExcelChunk failed: chunkIndex must be a non-negative number');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    
    if (!chunkSize || typeof chunkSize !== 'number' || chunkSize <= 0) {
      const error = new Error('SFTP getExcelChunk failed: chunkSize must be a positive number');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    
    console.log('📄 SFTP: Reading Excel chunk from:', filePath);
    console.log('🔧 SFTP: Chunk index:', chunkIndex);
    console.log('🔧 SFTP: Chunk size:', chunkSize);
    
    const startTime = Date.now();
    
    return sftp
      .get(filePath)
      .then(buffer => {
        const duration = Date.now() - startTime;
        console.log('✅ SFTP: Excel file downloaded in', `${duration}ms`);
        console.log('📊 SFTP: File size:', buffer.length, 'bytes');
        
        return processExcelChunk(buffer, filePath, chunkIndex, chunkSize);
      })
      .then(result => {
        console.log('✅ SFTP: Excel chunk processing completed');
        console.log('📊 SFTP: Chunk rows:', result.chunkData.length);
        
        return {
          ...state,
          chunkData: result.chunkData,
          chunkMetadata: result.chunkMetadata,
          data: result.chunkData, // For backward compatibility
        };
      })
      .then(state => {
        const totalDuration = Date.now() - startTime;
        console.log('🎉 SFTP: Excel chunk operation completed in', `${totalDuration}ms`);
        return state;
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        console.error('❌ SFTP: Excel chunk failed after', `${duration}ms`);
        console.error('❌ SFTP: File path:', filePath);
        console.error('❌ SFTP: Chunk index:', chunkIndex);
        console.error('❌ SFTP: Error details:', error.message);
        
        const enhancedError = new Error(`SFTP Excel chunk failed for '${filePath}' chunk ${chunkIndex}: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.filePath = filePath;
        enhancedError.chunkIndex = chunkIndex;
        enhancedError.operation = 'getExcelChunk';
        throw enhancedError;
      });
  };
}

/**
 * Get CSV metadata (row counts, chunk count) via SFTP
 * @public
 * @param {string} filePath
 * @param {number} chunkSize
 * @param {object} options
 */
export function getCsvMetadata(filePath, chunkSize = 5000, options = {}) {
  return async state => {
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    const startTime = Date.now();
    const buffer = await sftp.get(filePath);
    // Filter out lines with a different column count than the header (drops mid-file MMD section)
    const raw = buffer.toString('utf8');
    const lines = raw.split(/\r?\n/);
    const header = lines[0] || '';
    const headerCount = (header.match(/,/g) || []).length + 1;
    const filtered = lines
      .filter((line, idx) => {
        const trimmed = (line || '').trim();
        if (!trimmed) return false; // drop empty
        if (idx === 0) return true; // keep header
        const count = (line.match(/,/g) || []).length + 1;
        return count === headerCount;
      })
      .join('\n');
    const stream = Readable.from(filtered);
    const parsedState = await parseCsv(stream, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, relax_column_count_more: true, relax_column_count_less: true, ...options })(state);
    const rows = Array.isArray(parsedState.data) ? parsedState.data : [];
    const totalRows = rows.length;
    const totalChunks = Math.ceil(totalRows / chunkSize);
    const duration = Date.now() - startTime;
    console.log('✅ SFTP: CSV metadata parsed in', `${duration}ms`, 'rows:', totalRows, 'chunks:', totalChunks);
    return {
      ...state,
      data: {
        fileName: filePath,
        totalRows,
        chunkSize,
        totalChunks,
        metadata: { processedAt: new Date().toISOString(), processingMethod: 'csv-rows' }
      }
    };
  };
}

/**
 * Get a CSV chunk (array of row objects) via SFTP
 * @public
 * @param {string} filePath
 * @param {number} chunkIndex
 * @param {number} chunkSize
 * @param {object} options
 */
export function getCsvChunk(filePath, chunkIndex = 0, chunkSize = 5000, options = {}) {
  return async state => {
    if (!sftp || !sftp.sftp) {
      const error = new Error('SFTP operation failed: not connected to server');
      console.error('❌ SFTP:', error.message);
      throw error;
    }
    const startTime = Date.now();
    const buffer = await sftp.get(filePath);
    // Filter out lines with a different column count than the header (drops mid-file MMD section)
    const raw = buffer.toString('utf8');
    const lines = raw.split(/\r?\n/);
    const header = lines[0] || '';
    const headerCount = (header.match(/,/g) || []).length + 1;
    const filtered = lines
      .filter((line, idx) => {
        const trimmed = (line || '').trim();
        if (!trimmed) return false; // drop empty
        if (idx === 0) return true; // keep header
        const count = (line.match(/,/g) || []).length + 1;
        return count === headerCount;
      })
      .join('\n');
    const stream = Readable.from(filtered);
    const parsedState = await parseCsv(stream, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, relax_column_count_more: true, relax_column_count_less: true, ...options })(state);
    const rows = Array.isArray(parsedState.data) ? parsedState.data : [];
    const start = chunkIndex * chunkSize;
    const end = Math.min(start + chunkSize, rows.length);
    const slice = rows.slice(start, end);
    const duration = Date.now() - startTime;
    console.log('✅ SFTP: CSV chunk parsed in', `${duration}ms`, 'chunk rows:', slice.length);
    return {
      ...state,
      chunkData: slice,
      chunkMetadata: {
        chunkIndex,
        chunkNumber: chunkIndex + 1,
        chunkSize,
        actualRows: slice.length,
        fileName: filePath,
        processedAt: new Date().toISOString(),
        processingMethod: 'csv-rows'
      }
    };
  };
}

/**
 * Process Excel file to get metadata without loading data
 * @private
 */
async function processExcelMetadata(buffer, filePath, chunkSize, options = {}) {
  console.log('🔧 SFTP: Starting Excel metadata processing...');
  
  // Import modules
  let xlstreamModule;
  let writeFileSync, unlinkSync, join, tmpdir;
  
  try {
    xlstreamModule = await import('xlstream');
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const osModule = await import('os');
    
    writeFileSync = fsModule.writeFileSync;
    unlinkSync = fsModule.unlinkSync;
    join = pathModule.join;
    tmpdir = osModule.tmpdir;
    
    console.log('✅ SFTP: Required modules imported for metadata processing');
  } catch (importError) {
    console.error('❌ SFTP: Failed to import required modules:', importError.message);
    throw new Error(`Module import failed: ${importError.message}`);
  }
  
  const { getXlsxStream } = xlstreamModule;
  
  // Create temporary file
  const tempDir = tmpdir();
  const tempFileName = `excel-metadata-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`;
  const tempFilePath = join(tempDir, tempFileName);
  
  console.log('🔧 SFTP: Creating temporary file for metadata:', tempFilePath);
  
  let tempFileCreated = false;
  
  try {
    writeFileSync(tempFilePath, buffer);
    tempFileCreated = true;
    
    return new Promise(async (resolve, reject) => {
      // Helper function to clean up temporary file
      const cleanupTempFile = () => {
        if (tempFileCreated) {
          try {
            unlinkSync(tempFilePath);
            console.log('✅ SFTP: Temporary metadata file cleaned up');
          } catch (cleanupError) {
            console.warn('⚠️  SFTP: Could not clean up temporary metadata file:', cleanupError.message);
          }
        }
      };
      
      try {
        const streamOptions = {
          filePath: tempFilePath,
          sheet: 0,
          withHeader: true,
          ignoreEmpty: true,
        };
        
        const stream = await getXlsxStream(streamOptions);
        
        let totalRows = 0;
        let finished = false;
        
        // Initialize unique value collectors based on column mapping
        const uniqueValues = {};
        const orgUnitParentMap = {}; // Simple mapping: orgUnit -> parent
        if (options.columnMapping) {
          Object.keys(options.columnMapping).forEach(key => {
            uniqueValues[key] = new Set();
          });
          console.log('🔧 SFTP: Initialized unique value collectors for:', Object.keys(uniqueValues));
        }
        
        stream.on('data', (row) => {
          if (finished) return;
          totalRows++;
          
          // Collect unique values from this row using column mapping
          const rowData = (row.raw && row.raw.obj) || (row.formatted && row.formatted.obj) || row;
          
          if (options.columnMapping) {
            // First pass: collect values from this row
            const rowValues = {};
            Object.entries(options.columnMapping).forEach(([key, possibleColumns]) => {
              // Try each possible column name for this key
              for (const columnName of possibleColumns) {
                if (rowData[columnName] !== undefined && rowData[columnName] !== null && rowData[columnName] !== '') {
                  uniqueValues[key].add(rowData[columnName]);
                  rowValues[key] = rowData[columnName];
                  break; // Stop at first match
                }
              }
            });
            
            // Second pass: build parent-child relationships from this row
            // Only store if mapping doesn't already exist to avoid redundant work
            if (rowValues.regions && rowValues.zones && !orgUnitParentMap[rowValues.zones]) {
              orgUnitParentMap[rowValues.zones] = rowValues.regions;
            }
            
            if (rowValues.zones && rowValues.districts && !orgUnitParentMap[rowValues.districts]) {
              orgUnitParentMap[rowValues.districts] = rowValues.zones;
            }
            
            if (rowValues.districts && rowValues.sites && !orgUnitParentMap[rowValues.sites]) {
              orgUnitParentMap[rowValues.sites] = rowValues.districts;
            }
          }
          
          // Log progress every 10K rows
          if (totalRows % 10000 === 0) {
            console.log('📊 SFTP: Metadata processing row:', totalRows);
          }
        });
        
        stream.on('end', () => {
          console.log('✅ SFTP: Metadata stream ended successfully');
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            resolve(createMetadataResult(totalRows, chunkSize, filePath, uniqueValues, orgUnitParentMap));
          }
        });
        
        stream.on('error', (error) => {
          console.error('❌ SFTP: Metadata stream error:', error.message);
          console.error('❌ SFTP: Error details:', {
            code: error.code,
            message: error.message,
            stack: error.stack
          });
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            reject(new Error(`Excel metadata processing failed: ${error.message}`));
          }
        });
        
        // Handle stream close events
        stream.on('close', () => {
          console.log('📡 SFTP: Metadata stream closed');
          if (!finished) {
            console.log('✅ SFTP: Metadata processing completed on stream close');
            finished = true;
            cleanupTempFile();
            resolve(createMetadataResult(totalRows, chunkSize, filePath, uniqueValues, orgUnitParentMap));
          }
        });
        
      } catch (error) {
        console.error('❌ SFTP: Error in metadata processing:', error.message);
        cleanupTempFile();
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('❌ SFTP: Error in processExcelMetadata:', error.message);
    // Clean up if we created the file but failed before returning the Promise
    if (tempFileCreated) {
      try {
        unlinkSync(tempFilePath);
        console.log('✅ SFTP: Temporary metadata file cleaned up after error');
      } catch (cleanupError) {
        console.warn('⚠️  SFTP: Could not clean up temporary metadata file:', cleanupError.message);
      }
    }
    throw error;
  }
}

/**
 * Process Excel file to get a specific chunk of data
 * @private
 */
async function processExcelChunk(buffer, filePath, chunkIndex, chunkSize) {
  console.log('🔧 SFTP: Starting Excel chunk processing...');
  console.log('🔧 SFTP: Target chunk:', chunkIndex);
  console.log('🔧 SFTP: Chunk size:', chunkSize);
  
  // Import modules
  let xlstreamModule;
  let writeFileSync, unlinkSync, join, tmpdir;
  
  try {
    xlstreamModule = await import('xlstream');
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const osModule = await import('os');
    
    writeFileSync = fsModule.writeFileSync;
    unlinkSync = fsModule.unlinkSync;
    join = pathModule.join;
    tmpdir = osModule.tmpdir;
    
    console.log('✅ SFTP: Required modules imported for chunk processing');
  } catch (importError) {
    console.error('❌ SFTP: Failed to import required modules:', importError.message);
    throw new Error(`Module import failed: ${importError.message}`);
  }
  
  const { getXlsxStream } = xlstreamModule;
  
  // Create temporary file
  const tempDir = tmpdir();
  const tempFileName = `excel-chunk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.xlsx`;
  const tempFilePath = join(tempDir, tempFileName);
  
  console.log('🔧 SFTP: Creating temporary file for chunk:', tempFilePath);
  
  let tempFileCreated = false;
  
  try {
    writeFileSync(tempFilePath, buffer);
    tempFileCreated = true;
    
    return new Promise(async (resolve, reject) => {
      // Helper function to clean up temporary file
      const cleanupTempFile = () => {
        if (tempFileCreated) {
          try {
            unlinkSync(tempFilePath);
            console.log('✅ SFTP: Temporary chunk file cleaned up');
          } catch (cleanupError) {
            console.warn('⚠️  SFTP: Could not clean up temporary chunk file:', cleanupError.message);
          }
        }
      };
      
      try {
        const streamOptions = {
          filePath: tempFilePath,
          sheet: 0,
          withHeader: true,
          ignoreEmpty: true,
        };
        
        const stream = await getXlsxStream(streamOptions);
        
        let currentRow = 0;
        let chunkData = [];
        let finished = false;
        
        const startRow = chunkIndex * chunkSize;
        const endRow = startRow + chunkSize - 1;
        
        console.log('🔧 SFTP: Target row range:', startRow, 'to', endRow);
        
        stream.on('data', (row) => {
          if (finished) return;
          
          // Check if we're in the target chunk range
          if (currentRow >= startRow && currentRow <= endRow) {
            chunkData.push(row.formatted || row);
            
            // Log progress within chunk
            if (chunkData.length % 1000 === 0) {
              console.log('📦 SFTP: Chunk data collected:', chunkData.length, 'rows');
            }
          }
          
          currentRow++;
          
          // Stop processing if we've collected the full chunk
          if (chunkData.length >= chunkSize) {
            console.log('📦 SFTP: Chunk collection complete');
            finished = true;
            stream.destroy();
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
            return;
          }
          
          // Skip ahead if we haven't reached the target chunk yet
          if (currentRow < startRow && currentRow % 10000 === 0) {
            console.log('📊 SFTP: Skipping to chunk, current row:', currentRow);
          }
        });
        
        stream.on('end', () => {
          console.log('✅ SFTP: Chunk stream ended successfully');
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
          }
        });
        
        stream.on('error', (error) => {
          console.error('❌ SFTP: Chunk stream error:', error.message);
          console.error('❌ SFTP: Error details:', {
            code: error.code,
            message: error.message,
            chunkIndex,
            chunkSize,
            currentRow,
            collectedRows: chunkData.length
          });
          
          if (!finished) {
            finished = true;
            cleanupTempFile();
            reject(new Error(`Excel chunk processing failed for chunk ${chunkIndex}: ${error.message}`));
          }
        });
        
        // Handle stream close events
        stream.on('close', () => {
          console.log('📡 SFTP: Chunk stream closed');
          if (!finished) {
            console.log('✅ SFTP: Chunk processing completed on stream close');
            finished = true;
            cleanupTempFile();
            resolve(createChunkResult(chunkData, chunkIndex, chunkSize, filePath));
          }
        });
        
      } catch (error) {
        console.error('❌ SFTP: Error in chunk processing:', error.message);
        cleanupTempFile();
        reject(error);
      }
    });
    
  } catch (error) {
    console.error('❌ SFTP: Error in processExcelChunk:', error.message);
    // Clean up if we created the file but failed before returning the Promise
    if (tempFileCreated) {
      try {
        unlinkSync(tempFilePath);
        console.log('✅ SFTP: Temporary chunk file cleaned up after error');
      } catch (cleanupError) {
        console.warn('⚠️  SFTP: Could not clean up temporary chunk file:', cleanupError.message);
      }
    }
    throw error;
  }
}

/**
 * Create metadata result object
 * @private
 */
function createMetadataResult(totalRows, chunkSize, filePath, uniqueValues = null, orgUnitParentMap = null) {
  const totalChunks = Math.ceil(totalRows / chunkSize);
  const chunks = [];
  
  for (let i = 0; i < totalChunks; i++) {
    const startRow = i * chunkSize;
    const endRow = Math.min(startRow + chunkSize - 1, totalRows - 1);
    const rowCount = endRow - startRow + 1;
    
    chunks.push({
      chunkIndex: i,
      chunkNumber: i + 1,
      startRow,
      endRow,
      rowCount
    });
  }
  
  console.log('📊 SFTP: Metadata complete:');
  console.log('   - Total rows:', totalRows);
  console.log('   - Chunk size:', chunkSize);
  console.log('   - Total chunks:', totalChunks);
  
  // Convert unique values Sets to Arrays and log counts
  let uniqueValuesArrays = null;
  if (uniqueValues && Object.keys(uniqueValues).length > 0) {
    uniqueValuesArrays = {};
    Object.entries(uniqueValues).forEach(([key, valueSet]) => {
      uniqueValuesArrays[key] = Array.from(valueSet);
    });
    
    console.log('📊 SFTP: Unique values discovered:');
    Object.entries(uniqueValuesArrays).forEach(([key, values]) => {
      console.log(`   - ${key}: ${values.length} unique values`);
    });
  } else {
    console.log('📊 SFTP: No unique values collected (no column mapping provided)');
  }

     // Log organizational unit parent mappings
   if (orgUnitParentMap && Object.keys(orgUnitParentMap).length > 0) {
     console.log('📊 SFTP: Organizational unit parent mappings discovered:');
     console.log(`   - Total mappings: ${Object.keys(orgUnitParentMap).length}`);
     Object.entries(orgUnitParentMap).forEach(([orgUnit, parent]) => {
       console.log(`     - ${orgUnit} -> ${parent}`);
     });
   } else {
     console.log('📊 SFTP: No organizational unit parent mappings collected');
   }
  
  const result = {
    fileName: filePath,
    totalRows,
    chunkSize,
    totalChunks,
    chunks,
    metadata: {
      processedAt: new Date().toISOString(),
      processingMethod: 'xlstream-metadata',
    }
  };
  
  // Add unique values if collected
  if (uniqueValuesArrays) {
    result.uniqueValues = uniqueValuesArrays;
  }

     // Add organizational unit parent mappings if collected
   if (orgUnitParentMap) {
     result.orgUnitParentMap = orgUnitParentMap;
   }
  
  return result;
}

/**
 * Create chunk result object
 * @private
 */
function createChunkResult(chunkData, chunkIndex, chunkSize, filePath) {
  console.log('📦 SFTP: Chunk complete:');
  console.log('   - Chunk index:', chunkIndex);
  console.log('   - Rows collected:', chunkData.length);
  
  return {
    chunkData,
    chunkMetadata: {
      chunkIndex,
      chunkNumber: chunkIndex + 1,
      chunkSize,
      actualRows: chunkData.length,
      fileName: filePath,
      processedAt: new Date().toISOString(),
      processingMethod: 'xlstream-chunk',
    }
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

export {
  alterState,
  fn,
  fnIf,
  dataPath,
  dataValue,
  each,
  field,
  fields,
  http,
  lastReferenceValue,
  merge,
  sourceValue,
  chunk,
  parseCsv,
} from '@openfn/language-common';
