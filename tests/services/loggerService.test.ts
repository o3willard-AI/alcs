import fs from 'fs';
import path from 'path';

// Mock all dependencies at the top level
jest.mock('../../src/services/configService', () => ({
  configManager: {
    config: {
      log_level: 'debug',
      log_path: './logs/test.log',
    },
  },
}));

// Create mock functions at module scope so they persist across resetModules
const mockExistsSync = jest.fn();
const mockMkdirSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  createWriteStream: jest.fn(() => ({ on: jest.fn(), end: jest.fn() })),
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
  },
}));

const mockedFs = {
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
};

const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock the DailyRotateFile transport constructor
const mockDailyRotateFileTransportConstructor = jest.fn().mockImplementation(() => ({}));

// Mock winston-daily-rotate-file module
jest.mock('winston-daily-rotate-file', () => mockDailyRotateFileTransportConstructor);

// Mock winston module
jest.mock('winston', () => {
  const actualWinston = jest.requireActual('winston');
  return {
    format: {
      combine: jest.fn((...args) => args),
      timestamp: jest.fn(() => ({})),
      printf: jest.fn(() => ({})),
      colorize: jest.fn(() => ({})),
    },
    transports: {
      Console: jest.fn(() => ({})),
      // DailyRotateFile will be added by the side-effect import
      get DailyRotateFile() {
        return mockDailyRotateFileTransportConstructor;
      },
    },
    createLogger: jest.fn(() => mockLoggerInstance),
  };
});

// Import after mocks
import { logger } from '../../src/services/loggerService';
import winston from 'winston';

describe('Logger Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize logger with correct level and path from AppConfig', () => {
    mockedFs.existsSync.mockReturnValue(true);
    jest.resetModules();
    require('../../src/services/loggerService');
    const winstonModule = require('winston');

    expect(winstonModule.createLogger).toHaveBeenCalledTimes(1);
    const loggerOptions = (winstonModule.createLogger as jest.Mock).mock.calls[0][0];

    expect(loggerOptions.level).toBe('debug');
    expect(loggerOptions.transports).toHaveLength(2);
    expect(winstonModule.transports.Console).toHaveBeenCalledTimes(1);
    expect(mockDailyRotateFileTransportConstructor).toHaveBeenCalledTimes(2);

    const mainTransportOptions = mockDailyRotateFileTransportConstructor.mock.calls[0][0];
    expect(mainTransportOptions.filename).toContain(path.join('logs', '%DATE%.log'));
    expect(mainTransportOptions.level).toBe('debug');
  });

  it('should create log directory if it does not exist', () => {
    mockedFs.existsSync.mockReturnValue(false);
    jest.resetModules();
    require('../../src/services/loggerService');
    expect(mockedFs.mkdirSync).toHaveBeenCalledTimes(1);
  });

  it('should not create log directory if it already exists', () => {
    mockedFs.existsSync.mockReturnValue(true);
    jest.resetModules();
    require('../../src/services/loggerService');
    expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
  });
});