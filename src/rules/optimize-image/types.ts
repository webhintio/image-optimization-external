export type Bytes = {
    input: number;
    output: number;
    savings: number;
};

export type File = {
    url: string;
    name: string;
    bytes: Bytes;
    format: string;
    width?: number;
    height?: number;
    colorspace?: string;
    depth?: number;
    sampling?: string;
    quality?: number;
};

export type Result = {
    files: Array<File>;
    summary: {
        image: number;
        bytes: {
            input: number;
            output: number;
            savings: number;
        };
    };
};
