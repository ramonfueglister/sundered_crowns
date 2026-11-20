// The address of a file of the world's data with the build's stamp in it (`?v=`: the stamp of the code and data the
// pieces are made of, tools/stamp/piece_key.ts; on the dev server the time it started). The host lets browsers keep
// the tables and the tiles of the regions for good under such an address (vercel.json), so that a piece that is not
// kept on disk is read again without asking the host whether the file has changed; a build that changes the data
// has another stamp, and so other addresses. Where no build stamped the code (the tools, run by tsx) the address
// stays as it is.
declare const __BUILD__: string | undefined;

export const stamped = (url: string) =>
  typeof __BUILD__ === 'string' ? `${url}${url.includes('?') ? '&' : '?'}v=${__BUILD__}` : url;
