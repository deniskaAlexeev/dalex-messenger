// Простой цветной логгер для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

const logger = {
  info: (msg, ...args) => {
    console.log(`${colors.gray}[${ts()}]${colors.reset} ${colors.cyan}INFO${colors.reset}  ${msg}`, ...args);
  },
  success: (msg, ...args) => {
    console.log(`${colors.gray}[${ts()}]${colors.reset} ${colors.green}OK${colors.reset}    ${msg}`, ...args);
  },
  warn: (msg, ...args) => {
    console.warn(`${colors.gray}[${ts()}]${colors.reset} ${colors.yellow}WARN${colors.reset}  ${msg}`, ...args);
  },
  error: (msg, err) => {
    console.error(`${colors.gray}[${ts()}]${colors.reset} ${colors.red}ERROR${colors.reset} ${msg}`);
    if (err) {
      console.error(`${colors.red}  →${colors.reset} ${err.message || err}`);
      if (err.stack && process.env.NODE_ENV !== 'production') {
        console.error(colors.gray + err.stack + colors.reset);
      }
    }
  },
  http: (method, path, status, ms) => {
    const color = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;
    console.log(
      `${colors.gray}[${ts()}]${colors.reset} ${colors.blue}HTTP${colors.reset}  ` +
      `${method.padEnd(6)} ${path.padEnd(40)} ${color}${status}${colors.reset} ${colors.gray}${ms}ms${colors.reset}`
    );
  }
};

module.exports = logger;
