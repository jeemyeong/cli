/* eslint-disable no-param-reassign, no-console */

// Server entry point, for Webpack.  This will spawn a Koa web server
// and listen for HTTP requests.  Clients will get a return render of React
// or the file they have requested
//
// Note:  No HTTP optimisation is performed here (gzip, http/2, etc).  Node.js
// will nearly always be slower than Nginx or an equivalent, dedicated proxy,
// so it's usually better to leave that stuff to a faster upstream provider

// ----------------------
// IMPORTS

// React UI
import React from 'react';

// React utility to transform JSX to HTML (to send back to the client)
import ReactDOMServer from 'react-dom/server';

// Koa 2 web server.  Handles incoming HTTP requests, and will serve back
// the React render, or any of the static assets being compiled
import Koa from 'koa';

// HTTP header hardening
import koaHelmet from 'koa-helmet';

// Koa Router, for handling URL requests
import KoaRouter from 'koa-router';

// Static file handler
import koaStatic from 'koa-static';

// High-precision timing, so we can debug response time to serve a request
import ms from 'microseconds';

// Embedded Javascript views -- we'll use this to inject React and other
// data into the HTML that is rendered back to the client
import ejs from 'ejs';

// Routing and route matching
// import { match, RouterContext } from 'react-router';

// Promisify lib, to turn callback funtions into Promises
// import promisify from 'es6-promisify';

// <Helmet> component for retrieving <head> section, so we can set page
// title, meta info, etc along with the initial HTML
import Helmet from 'react-helmet';

// Initial view to send back HTML render
import view from 'kit/views/ssr.ejs';

// Import paths.  We'll use this to figure out where our public folder is
// so we can serve static files
import PATHS from 'paths';

// Routes
// import routes from 'src/routes';

// dependencies for creating "custom made" recycle instance
import Rx from 'rxjs/Rx';
import Recycle from 'recyclejs/recycle';
import streamAdapter from 'recyclejs/adapter/rxjs';
import reactDriver from 'recyclejs/drivers/react';

// drivers and components
import storeDriver from 'kit/lib/store';
import App from 'src/root';

// ----------------------

// Promisify match, so we can use it with async/await
// const matchPromise = promisify(match, { multiArgs: true });

// Port to bind to.  Takes this from the `PORT` environment var, or assigns
// to 4000 by default
const PORT = process.env.PORT || 4000;

// Run the server
(async function server() {
  // Set up routes
  const router = (new KoaRouter())
    // Set-up a general purpose /ping route to check the server is alive
    .get('/ping', async ctx => {
      ctx.body = 'pong';
    })

    // Everything else is React
    .get('/*', async ctx => {
      // Create new React Router context
      // const route = {};

      // Create new RxJS context
      // const rxContext = new RxContext();

      // Build a query to represent the current route
      // const query = {
      //   routes,
      //   location: ctx.request.url,
      // };

      // Match against the current route
      // const [redir, renderProps] = await matchPromise(query);

      // `redir` not empty? We need to issue a 302 redirect
      // if (redir) {
      //   return ctx.redirect(redir.pathname + redir.search);
      // }

      // No `renderProps`?  We've hit a 404
      // if (!renderProps) {
      //   ctx.status = 404;
      //   ctx.body = 'Error 404 - route not found';
      //   return false;
      // }

      // Get the `components` from renderProps - this is our hierarchy of
      // React components
      // const { components } = renderProps;

      // Register the observables
      // await context.ssr(components);

      // Generate the HTML from our React tree.  We're wrapping the result
      // in `react-router`'s <StaticRouter> which will pull out URL info and
      // store it in our empty `route` object
      // const html = ReactDOMServer.renderToString(
      //   <RxProvider context={rxContext}>
      //     <RouterContext {...renderProps} />
      //   </RxProvider>,
      // );

      const recycle = Recycle(streamAdapter(Rx));
      recycle.use(storeDriver, reactDriver(React));
      const AppReact = recycle.createComponent(App).get('ReactComponent');

      console.log('AppReact ->', AppReact);

      const p = new Promise((resolve, reject) => {
        // getDriver('store') is avaiable
        // because storeDriver had returned an object: { name: 'store', store$: <stream> }
        recycle.getDriver('store').store$.take(1)
          .subscribe(
            nextState => {
              console.log('next ->', nextState);
            },
            err => {
              console.error('Error:', err);
              reject(err);
            },
            () => {
              // stream has completed
              // first event was fired, and components had updated
              const html = ReactDOMServer.renderToString(AppReact);
              ctx.body = ejs.render(view, {
                // <head> section
                head: Helmet.rewind(),

                // Full React HTML render
                html,
              });
              resolve(html);
            },
          );
      });

      // Render the view with our injected React data
      // ctx.body = ejs.render(view, {
      //   // <head> section
      //   head: Helmet.rewind(),
      //
      //   // Full React HTML render
      //   html,
      // });

      return p;
    });

  // Start Koa
  (new Koa())

    // Preliminary security for HTTP headers
    .use(koaHelmet())

    // Error wrapper.  If an error manages to slip through the middleware
    // chain, it will be caught and logged back here
    .use(async (ctx, next) => {
      try {
        await next();
      } catch (e) {
        // TODO we've used rudimentary console logging here.  In your own
        // app, I'd recommend you implement third-party logging so you can
        // capture errors properly
        console.log('Error', e.message);
        ctx.body = 'There was an error. Please try again later.';
      }
    })

    // It's useful to see how long a request takes to respond.  Add the
    // timing to a HTTP Response header
    .use(async (ctx, next) => {
      const start = ms.now();
      await next();
      const end = ms.parse(ms.since(start));
      const total = end.microseconds + (end.milliseconds * 1e3) + (end.seconds * 1e6);
      ctx.set('Response-Time', `${total / 1e3}ms`);
    })

    // Serve static files from our dist/public directory, which is where
    // the compiled JS, images, etc will wind up
    .use(koaStatic(PATHS.public, {
      // Don't defer to middleware.  If we have a file, serve it immediately
      defer: false,
    }))

    // If the requests makes it here, we'll assume they need to be handled
    // by the router
    .use(router.routes())
    .use(router.allowedMethods())

    // Bind to the specified port
    .listen(PORT);
}());
