import 'winston';
import 'winston-daily-rotate-file'; // This line might still be needed for runtime, but not for types import

declare module 'winston' {
  interface Transports {
    DailyRotateFile: winston.DailyRotateFileTransportInstance;
  }
}

declare namespace winston {
  interface DailyRotateFileTransportOptions extends winston.transport.FileTransportOptions {
    filename?: string;
    datePattern?: string;
    zippedArchive?: boolean;
    maxSize?: string;
    maxFiles?: string;
    options?: object;
    level?: string;
    format?: winston.Logform.Format;
  }

  interface DailyRotateFileTransportInstance extends winston.transport {
    new (options?: DailyRotateFileTransportOptions): DailyRotateFileTransportInstance;
  }

  interface Transports {
    DailyRotateFile: DailyRotateFileTransportInstance;
  }
}
