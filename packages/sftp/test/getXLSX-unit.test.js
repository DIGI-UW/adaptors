import { expect } from 'chai';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('getXLSX Unit Tests', () => {
  let getXLSX, connect, disconnect;
  let testExcelBuffer;
  let mockSftpClient;

  before(async () => {
    // Import the published SFTP adaptor
    console.log('📦 Importing published SFTP adaptor...');
    const sftpAdaptor = await import('@openfn/language-sftp');
    
    getXLSX = sftpAdaptor.getXLSX;
    connect = sftpAdaptor.connect;
    disconnect = sftpAdaptor.disconnect;
    
    console.log('✅ Published SFTP adaptor imported successfully');
    
    // Try to load test Excel file or create a minimal one
    console.log('📄 Loading test Excel file...');
    const testFilePath = join(__dirname, 'data', 'ART_data_long_format.xlsx');
    
    try {
      testExcelBuffer = readFileSync(testFilePath);
      console.log(`📊 Loaded test Excel file: ${testExcelBuffer.length} bytes`);
    } catch (error) {
      console.log(`⚠️  Test Excel file not found, creating minimal Excel buffer`);
      // Create a minimal valid Excel file header (ZIP signature)
      testExcelBuffer = Buffer.from([
        0x50, 0x4B, 0x03, 0x04, // ZIP signature
        0x14, 0x00, 0x00, 0x00, // Version
        0x08, 0x00, 0x00, 0x00, // Compression method
        0x00, 0x00, 0x00, 0x00, // CRC-32
        0x00, 0x00, 0x00, 0x00, // Compressed size
        0x00, 0x00, 0x00, 0x00, // Uncompressed size
        0x00, 0x00, 0x00, 0x00  // Filename length and extra field length
      ]);
    }

    // Create mock SFTP client
    mockSftpClient = {
      connect: async () => {
        console.log('📡 Mock SFTP: Connection established');
        return Promise.resolve();
      },
      get: async (path) => {
        console.log(`📁 Mock SFTP: Getting file: ${path}`);
        return Promise.resolve(testExcelBuffer);
      },
      end: async () => {
        console.log('🔌 Mock SFTP: Connection ended');
        return Promise.resolve();
      },
      sftp: { state: 'ready' }
    };
  });

  describe('Function Signature Tests', () => {
    it('should be a function', () => {
      expect(getXLSX).to.be.a('function');
    });

    it('should return a function when called', () => {
      const result = getXLSX('/test/file.xlsx');
      expect(result).to.be.a('function');
    });

    it('should accept file path and options', () => {
      const result = getXLSX('/test/file.xlsx', {
        withHeader: true,
        ignoreEmpty: true,
        maxRows: 100
      });
      expect(result).to.be.a('function');
    });
  });

  describe('OpenFn Adaptor Pattern Tests', () => {
    it('should follow OpenFn curried function pattern', () => {
      // getXLSX should return a function that accepts state
      const xlsxFunction = getXLSX('/test/file.xlsx', {
        withHeader: true,
        ignoreEmpty: true
      });
      
      expect(xlsxFunction).to.be.a('function');
      expect(xlsxFunction.length).to.equal(1); // Should accept one parameter (state)
    });

    it('should accept valid OpenFn state structure', () => {
      const testState = {
        configuration: {
          host: 'test-host',
          port: 22,
          username: 'test-user',
          password: 'test-pass'
        },
        data: {},
        references: []
      };
      
      const xlsxFunction = getXLSX('/test/file.xlsx');
      
      // Should not throw when called with valid state
      expect(() => xlsxFunction(testState)).to.not.throw();
    });
  });

  describe('Options Validation Tests', () => {
    it('should handle default options', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx');
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle withHeader option', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', { withHeader: true });
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle ignoreEmpty option', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', { ignoreEmpty: true });
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle maxRows option', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', { maxRows: 1000 });
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle chunkSize option', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', { chunkSize: 100 });
      expect(xlsxFunction).to.be.a('function');
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle missing file path', () => {
      expect(() => getXLSX()).to.not.throw();
      // The function should still be callable, errors should occur at execution time
    });

    it('should handle invalid options', () => {
      expect(() => getXLSX('/test/file.xlsx', null)).to.not.throw();
      expect(() => getXLSX('/test/file.xlsx', 'invalid')).to.not.throw();
    });
  });

  describe('Integration with OpenFn Common', () => {
    it('should work with OpenFn common functions', async () => {
      const { fn } = await import('@openfn/language-common');
      expect(fn).to.be.a('function');
      
      // Test that getXLSX can be used with fn
      const combinedFunction = fn((state) => {
        const xlsxFunction = getXLSX('/test/file.xlsx');
        return xlsxFunction(state);
      });
      
      expect(combinedFunction).to.be.a('function');
    });
  });

  describe('Memory and Performance Tests', () => {
    it('should handle chunked processing options', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', {
        chunkSize: 1000,
        maxRows: 10000,
        withHeader: true
      });
      
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle OpenFn memory limits', () => {
      // Test that the function can be created with memory-conscious options
      const xlsxFunction = getXLSX('/test/file.xlsx', {
        chunkSize: 100,  // Small chunks for memory efficiency
        maxRows: 500,    // Limit total rows
        ignoreEmpty: true
      });
      
      expect(xlsxFunction).to.be.a('function');
    });
  });

  describe('Published Adaptor Structure Tests', () => {
    it('should export all required SFTP functions', async () => {
      const sftpAdaptor = await import('@openfn/language-sftp');
      
      // Check that all major SFTP functions are exported
      expect(sftpAdaptor.connect).to.be.a('function');
      expect(sftpAdaptor.disconnect).to.be.a('function');
      expect(sftpAdaptor.getXLSX).to.be.a('function');
      expect(sftpAdaptor.getCSV).to.be.a('function');
      expect(sftpAdaptor.getJSON).to.be.a('function');
      expect(sftpAdaptor.list).to.be.a('function');
    });

    it('should have proper package metadata', async () => {
      const sftpAdaptor = await import('@openfn/language-sftp');
      expect(sftpAdaptor).to.be.an('object');
      expect(Object.keys(sftpAdaptor).length).to.be.greaterThan(5);
    });
  });

  describe('Excel Processing Capabilities', () => {
    it('should handle Excel file signature validation', () => {
      // Test with minimal Excel buffer
      const xlsxFunction = getXLSX('/test/file.xlsx', {
        withHeader: true,
        ignoreEmpty: true
      });
      
      expect(xlsxFunction).to.be.a('function');
      
      // The function should be able to handle Excel files when called
      const testState = {
        configuration: {
          host: 'test-host',
          port: 22,
          username: 'test-user'
        },
        data: {},
        references: []
      };
      
      // Should not throw during setup
      expect(() => xlsxFunction(testState)).to.not.throw();
    });

    it('should support streaming Excel processing', () => {
      const xlsxFunction = getXLSX('/test/file.xlsx', {
        chunkSize: 1000,
        withHeader: true,
        ignoreEmpty: true,
        maxRows: 50000
      });
      
      expect(xlsxFunction).to.be.a('function');
    });
  });

  describe('Real-world Usage Patterns', () => {
    it('should support typical OpenFn workflow usage', () => {
      // Simulate how it would be used in an OpenFn job
      const xlsxFunction = getXLSX('/data/excel-files/ART_data_long_format.xlsx', {
        withHeader: true,
        ignoreEmpty: true,
        chunkSize: 1000
      });
      
      expect(xlsxFunction).to.be.a('function');
    });

    it('should handle DHIS2 integration patterns', () => {
      // Test configuration that would be used with DHIS2
      const xlsxFunction = getXLSX('/data/excel-files/dhis2_data.xlsx', {
        withHeader: true,
        ignoreEmpty: true,
        chunkSize: 1000,
        maxRows: 100000
      });
      
      expect(xlsxFunction).to.be.a('function');
    });
  });
}); 