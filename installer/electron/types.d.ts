// Type declarations for electron main process

declare module 'node-7z' {
    interface ExtractOptions {
        $bin?: string;
        $progress?: boolean;
        [key: string]: any;
    }

    interface ExtractStream {
        on(event: 'progress', callback: (progress: { percent: number }) => void): this;
        on(event: 'end', callback: () => void): this;
        on(event: 'error', callback: (err: Error) => void): this;
    }

    export function extractFull(archive: string, dest: string, options?: ExtractOptions): ExtractStream;
    export default { extractFull };
}

declare module '7zip-bin' {
    export const path7za: string;
}
