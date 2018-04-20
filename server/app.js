import express from 'express';
import path from 'path';
// import favicon from 'serve-favicon';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import flash from 'express-flash';
import fs from 'fs';
import methodOverride from 'method-override';
import gzip from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import serialize from 'serialize-javascript';
import session from 'express-session';
import logger from 'winston';

import { APP_URL, ENV, isDebug, isProduction, sessionSecret } from './config';

import { connect, session as sessionStore } from './db';

import initShopify from './routes/shopify';


var promise = require('bluebird');
var moment = require('moment');
var options = {
  // Initialization Options
  promiseLib: promise,
  query: e => {
    console.log(e.query);
  }
};

var pgp = require('pg-promise')(options);

var connectionString = 'postgres://hnmucpxelzxemu:ea53bf28e2a3678dadd2226093072fe2d67fbb1844447f9aae6c4818330384dc@ec2-54-204-21-226.compute-1.amazonaws.com:5432/d9eem55gemkhvm?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory';
var pdb = pgp(connectionString);



// We configure dotenv as early as possible in the app
require('dotenv').config();

// Connect database
connect();

const { SHOPIFY_API_KEY } = process.env;

const app = express();

/*if (ENV === 'production') {
  app.use(gzip());
  // Secure your Express apps by setting various HTTP headers. Documentation: https://github.com/helmetjs/helmet
  app.use(
    helmet({
      frameguard: {
        action: 'allow-from',
        domain: 'https://myshopify.com'
      }
    })
  );
}*/

if (ENV === 'production') {
  app.use(gzip());

  pdb.one('SELECT domain FROM public."Shops" ORDER BY id DESC LIMIT 1')
  .then(function (data) {
    console.log(data.domain);
    var shopUrl = data.domain;
      app.use(
        helmet({
          frameguard: {
            action: 'allow-from',
            domain: 'https://'+shopUrl
          }
        })
      );
  }, function (reason) {
    console.log(reason); // print error; 
  }).catch(function (err) {
    console.log(err);
  });

  // Secure your Express apps by setting various HTTP headers. Documentation: https://github.com/helmetjs/helmet
  
}

const env = {
  SHOPIFY_API_KEY
};

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(morgan(isDebug ? 'dev' : 'combined'));

const rawBodySaver = (req, res, buf, encoding) => {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
};

app.use(bodyParser.json({ verify: rawBodySaver }));
app.use(bodyParser.urlencoded({ extended: false }));

app.use(methodOverride());
app.use(cookieParser());

const staticOptions = isProduction && { index: '_' };
app.use(
  express.static(path.join(__dirname, '../react-ui/build'), staticOptions)
);

const sessionConfig = {
  resave: false,
  saveUninitialized: false,
  secret: sessionSecret,
  proxy: true, // The "X-Forwarded-Proto" header will be used.
  name: 'sessionId',
  // Add HTTPOnly, Secure attributes on Session Cookie
  // If secure is set, and you access your site over HTTP, the cookie will not be set
  cookie: {
    httpOnly: true,
    secure: ENV === 'production'
  },
  store: sessionStore
};

app.use(session(sessionConfig));
app.use(flash());

app.use('/', initShopify());

app.get('/api/products', (req, res) => {
  const { shopify } = req;

  shopify.product.list({ limit: 5 }).then(products => {
    res.status(200).json(products);
  });
});




/* app.get('/api/appcharges', function (req, res) {
  var shopify = req.shopify;
  console.log(dbcon);
   const query = client.query('SELECT * FROM blogList'); 
  res.status(200).json(shopify);
}); */


app.get('*', (req, res, next) => {
  const { shop } = req.session.shopify || {};

  const environment = { ...env, SHOP_ORIGIN: shop };

  fs.readFile(
    path.join(__dirname, '../react-ui/build/index.html'),
    'utf8',
    (err, content) => {
      if (err) {
        return next(err);
      }

      // Inject environment variables (Shopify API key and shop) in client code,
      // to be usd by the embedded app
      const replacement = `window.env = ${serialize(environment)}`;
      const result = content.replace('var __ENVIRONMENT__', replacement);
      return res.send(result);
    }
  );
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error(err);
  const status = err.status || 500;

  res.status(status);
  res.render(`${status}`, {
    message: err.message,
    error: isDebug && err.stack,
    APP_URL
  });
});

export default app;
