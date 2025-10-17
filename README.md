# Fast YouTube Search

Scraper rápido e otimizado para nodeJS.

## Installation

To install the SDK, run the following command:

```shell
npm install github:Lm-Omly/fast-yt-search
```

## Import

ESM

```javascript
import { yts } from 'fast-yt-search';
```
CJS

```javascript
const { yts } = require('fast-yt-search');
```

## Quickstart

```javascript
(async () => {
    const resultados = await yts('Hutao');
    console.log(resultados.all[0]);
})();
```
