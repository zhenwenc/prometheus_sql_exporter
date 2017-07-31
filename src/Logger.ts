import * as winston from 'winston';

const consoleTransport = (name?: string) => {
  return new winston.transports.Console({
    label: name,
    level: 'debug',
    colorize: true,
    timestamp: true,
    prettyPrint: true,
  });
};

export function getLogger(label: string) {
  return new winston.Logger({
    transports: [consoleTransport(label)],
  });
}
