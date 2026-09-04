declare module 'adm-zip' {
	interface ZipEntryHeader {
		size: number;
		compressedSize: number;
	}
	interface ZipEntry {
		entryName: string;
		header: ZipEntryHeader;
	}
	class AdmZip {
		constructor(input?: string | Buffer);
		getEntries(): ZipEntry[];
	}
	export = AdmZip;
}
