import {defineConfig} from "vite";
import dtsPlugin from "vite-plugin-dts";
import {resolve} from "path";

export default defineConfig({
    plugins: [
        dtsPlugin({
            outDir: ['dist', 'types'],
            staticImport: true,
            rollupTypes: true,
        })
    ],
    build: {
        lib: {
            entry: resolve(__dirname, "src/index.ts"),
            fileName: "janus-peer",
            name: "Janus-peer-js",
            formats: ["cjs", "es", "umd"],
        },
        rollupOptions: {
            external: ["twilio-video", "pixi.js", "webrtc-adapter", "peerjs-js-binarypack", "eventemitter3"],
            output: {
                globals: {
                    "twilio-video": "twilio-video",
                    "pixi.js": "pixi.js",
                    "webrtc-adapter": "webrtc-adapter",
                    "peerjs-js-binarypack": "peerjs-js-binarypack",
                    "eventemitter3": "eventemitter3"
                }
            }
        }
    }
})