import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ALLOW_HEADERS, ALLOW_METHODS, EXPOSE_HEADERS, USER_AGENT } from './const';

/**
The following logic basically comes from
https://github.com/isomorphic-git/cors-proxy/blob/main/middleware.js

Copyright 2017-2018 the 'cors-buster' authors

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

interface Env {
  ALLOW_ORIGINS: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use(
  cors({
    origin: (origin, c) => {
      const allowOriginText = (c.env as Env).ALLOW_ORIGINS;
      if (!allowOriginText) return null;
      if (allowOriginText === '*') return '*';
      const allowOrigins = allowOriginText.split(',').map(v => v.trim());
      return allowOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ALLOW_METHODS,
    allowHeaders: ALLOW_HEADERS,
    exposeHeaders: EXPOSE_HEADERS,
    credentials: false,
  }),
);

app.use(async c => {
  const url = new URL(c.req.url);

  const headers: Record<string, string> = {};
  ALLOW_HEADERS.forEach(name => {
    const value = c.req.header(name);
    if (value) headers[name] = value;
  });
  if (!headers['user-agent']?.startsWith('git/')) {
    headers['user-agent'] = USER_AGENT;
  }

  const [, pathDomain, remainingPath] = url.pathname.match(/\/([^\/]*)\/(.*)/) || [];
  if (!pathDomain || !remainingPath) return c.body(null, 404);

  const res = await fetch(`https://${pathDomain}/${remainingPath}${url.search}`, {
    method: c.req.method,
    redirect: 'manual',
    headers,
    body: c.req.method !== 'GET' && c.req.method !== 'HEAD' ? c.req.raw.body : undefined,
  });

  if (res.headers.has('location')) {
    // Modify the location so the client continues to use the proxy
    c.header('location', res.headers.get('location')!.replace(/^https?:\//, ''));
  }
  EXPOSE_HEADERS.forEach(name => {
    if (name === 'content-length') return;
    const value = res.headers.get(name);
    if (value) c.header(name, value);
  });
  if (res.redirected) c.header('x-redirected-url', res.url);
  return c.body(res.body, res.status as any);
});

export default app;
