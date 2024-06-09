import { CString, FFIType, JSCallback } from "bun:ffi";
import { encodeCString, instances, lib } from "./ffi";

export class Webview {
  #handle = null;
  #callbacks = new Map();

  set size({ width, height, hint }) {
    lib.symbols.webview_set_size(this.#handle, width, height, hint);
  }

  set title(title) {
    lib.symbols.webview_set_title(this.#handle, encodeCString(title));
  }

  constructor(
    debugOrHandle = false,
    size = { width: 1024, height: 768 },
    window = null,
  ) {
    this.#handle = typeof debugOrHandle === "bigint" || typeof debugOrHandle === "number"
      ? debugOrHandle
      : lib.symbols.webview_create(Number(debugOrHandle), window);
    if (size !== undefined) {
      this.size = size;
    }
    instances.push(this);
  }

  destroy() {
    for (const callback of this.#callbacks.keys()) {
      this.unbind(callback);
    }
    lib.symbols.webview_terminate(this.#handle);
    lib.symbols.webview_destroy(this.#handle);
    this.#handle = null;
  }

  navigate(url) {
    lib.symbols.webview_navigate(this.#handle, encodeCString(url));
  }

  setHTML(html) {
    lib.symbols.webview_set_html(this.#handle, encodeCString(html));
  }

  run() {
    lib.symbols.webview_run(this.#handle);
    this.destroy();
  }

  bindRaw(name, callback, arg) {
    const callbackResource = new JSCallback((seqPtr, reqPtr, arg) => {
      const seq = seqPtr ? new CString(seqPtr) : "";
      const req = reqPtr ? new CString(reqPtr) : "";
      callback(seq, req, arg);
    }, {
      args: [FFIType.pointer, FFIType.pointer, FFIType.pointer],
      returns: FFIType.void,
    });
    this.#callbacks.set(name, callbackResource);
    lib.symbols.webview_bind(
      this.#handle,
      encodeCString(name),
      callbackResource.ptr,
      arg,
    );
  }

  bind(name, callback) {
    this.bindRaw(name, (seq, req) => {
      const args = JSON.parse(req);
      let result;
      let success;
      try {
        result = callback(...args);
        success = true;
      } catch (err) {
        result = err;
        success = false;
      }
      if (result instanceof Promise) {
        result.then((result) =>
          this.return(seq, success ? 0 : 1, JSON.stringify(result)),
        );
      } else {
        this.return(seq, success ? 0 : 1, JSON.stringify(result));
      }
    });
  }

  unbind(name) {
    lib.symbols.webview_unbind(this.#handle, encodeCString(name));
    this.#callbacks.get(name)?.close();
    this.#callbacks.delete(name);
  }

  return(seq, status, result) {
    lib.symbols.webview_return(
      this.#handle,
      encodeCString(seq),
      status,
      encodeCString(result),
    );
  }

  eval(source) {
    lib.symbols.webview_eval(this.#handle, encodeCString(source));
  }

  init(source) {
    lib.symbols.webview_init(this.#handle, encodeCString(source));
  }
}
