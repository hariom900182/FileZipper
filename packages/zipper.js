//0 RAM usage, write directly to file system
class Zipper {
    options;
    handler;
    writer;
    nextHeaderOffset;
    currentHeaderOffset;
    filelist;
    headerlist;
    cdhList;
    ecdr;
    cdrOffset;
    currentOffset;
    constructor(options) {
        this.options = options || {}
        this.init();
    }

    init() {
        this.filelist = [];
        this.headerlist = [];
        this.cdhList = [];
        this.ecdr = {};
        this.writerOffset = 0;
        this.cdrOffset = 0;
        this.currentOffset = 0;
        this.nextHeaderOffset = 0;
        this.currentHeaderOffset = 0;
    }

    async create(filename, descripion) {
        this.init();
        this.handler = await window.showSaveFilePicker({
            suggestedName: filename ? filename : "zipper.zip",
            types: [{
                description: descripion ? descripion : "Zipper description",
                accept: { 'application/zip': ['.zip'] },
            }],
        })
        this.writer = await this.handler.createWritable();
    }
    async writeFile(filename, content) {
        const headerSize = await this.writefileHeader(filename, content);
        const filesize = await this.writefileContent(content);
        this.filelist.push({ filename: filename, size: filesize, headerOffset: this.nextHeaderOffset });
        this.currentOffset = this.nextHeaderOffset;
        this.nextHeaderOffset = this.nextHeaderOffset + headerSize + filesize;
        this.cdrOffset = this.cdrOffset + headerSize + filesize;
    }


    async done() {
        let size = 0;
        for (let i = 0; i < this.filelist.length; i++) {
            size = size + await this.writeFileCDR(this.filelist[i].filename, this.filelist[i].size, this.filelist[i].headerOffset);
        }
        await this.writeECDR(size, this.cdrOffset, this.filelist.length);
        await this.writer.close();
    }

    async writefileHeader(filename, content) {
        //Zip header size: 30 + file name size in bytes
        const textEncoeder = new TextEncoder();
        const nameBytes = textEncoeder.encode(filename);
        const fileDataBytes = content;

        const crc32Placeholder = 0x00000000;

        const sizeInBytes = fileDataBytes.byteLength; //same size of compressed and uncompressed (method 0 no compression)
        const fileHeaderSize = 30 + nameBytes.length;

        const fileHeaderBuffer = new ArrayBuffer(fileHeaderSize);
        const localHeaderView = new DataView(fileHeaderBuffer);

        this.writeUint32(localHeaderView, 0, 0x04034b50); //signature
        this.writeUint16(localHeaderView, 4, 20); //version
        this.writeUint16(localHeaderView, 6, 0); //general purpose flag
        this.writeUint16(localHeaderView, 8, 0); //compression method 0 = stored
        this.writeUint16(localHeaderView, 10, 0); //modification time 
        this.writeUint16(localHeaderView, 12, 0); //modification date
        this.writeUint32(localHeaderView, 14, crc32Placeholder); //crc32 placeholder
        this.writeUint32(localHeaderView, 18, sizeInBytes); //compressed size
        this.writeUint32(localHeaderView, 22, sizeInBytes); //un compressed size
        this.writeUint16(localHeaderView, 26, nameBytes.length); //length of file name
        this.writeUint16(localHeaderView, 28, 0); //extra field length

        //set file name in header
        const header = new Uint8Array(fileHeaderBuffer);
        header.set(nameBytes, 30)
        await this.writer.write(header);
        return fileHeaderSize;
    }

    async writeFileCDR(filename, size, headerOffset) {
        //Zip CDR size: 46 + file name size in bytes
        const textEncoeder = new TextEncoder();
        const nameBytes = textEncoeder.encode(filename);

        const crc32Placeholder = 0x00000000;

        const sizeInBytes = size;//same size of compressed and uncompressed (method 0 no compression)
        const fileCDRHeaderSize = 46 + nameBytes.length;
        const fileCDRBuffer = new ArrayBuffer(fileCDRHeaderSize);
        const fileCDRHeaderView = new DataView(fileCDRBuffer);

        this.writeUint32(fileCDRHeaderView, 0, 0x02014b50); //CDFH signature
        this.writeUint16(fileCDRHeaderView, 4, 20); //version
        this.writeUint16(fileCDRHeaderView, 6, 20); //general purpose flag
        this.writeUint16(fileCDRHeaderView, 8, 0); //general purpose flag
        this.writeUint16(fileCDRHeaderView, 10, 0); //compression method 0 = stored
        this.writeUint16(fileCDRHeaderView, 12, 0); //modification time 
        this.writeUint16(fileCDRHeaderView, 14, 0); //modification date
        this.writeUint32(fileCDRHeaderView, 16, crc32Placeholder); //crc32 placeholder
        this.writeUint32(fileCDRHeaderView, 20, sizeInBytes); //compressed size
        this.writeUint32(fileCDRHeaderView, 24, sizeInBytes); //un compressed size
        this.writeUint16(fileCDRHeaderView, 28, nameBytes.length); //length of file name
        this.writeUint16(fileCDRHeaderView, 30, 0); //extra field length
        this.writeUint16(fileCDRHeaderView, 32, 0); //file comment length
        this.writeUint16(fileCDRHeaderView, 34, 0); //disk number
        this.writeUint16(fileCDRHeaderView, 36, 0); //file attributes(internal)
        this.writeUint32(fileCDRHeaderView, 38, 0); //file attributes(internal)
        this.writeUint32(fileCDRHeaderView, 42, headerOffset); //relative offset of local header (0 for first file)

        const cdr = new Uint8Array(fileCDRBuffer)
        cdr.set(nameBytes, 46);
        await this.writer.write(cdr);
        return fileCDRHeaderSize;
    }

    async writeECDR(cdrSize, cdrOffset, cdrCounts) {
        const ecdrSize = 22;
        const ecdrBuffer = new ArrayBuffer(ecdrSize);
        const ecdrView = new DataView(ecdrBuffer);
        this.writeUint32(ecdrView, 0, 0x06054b50); //signature
        this.writeUint16(ecdrView, 4, 0); // number of the disk
        this.writeUint16(ecdrView, 6, 0); // CDR start
        this.writeUint16(ecdrView, 8, cdrCounts); //cdr counts on disk
        this.writeUint16(ecdrView, 10, cdrCounts); // cdr counts
        this.writeUint32(ecdrView, 12, cdrSize);
        this.writeUint32(ecdrView, 16, cdrOffset);
        this.writeUint16(ecdrView, 20, 0); //comment length
        const ecdr = new Uint8Array(ecdrBuffer);
        await this.writer.write(ecdr);
    }

    async writefileContent(content) {
        const fileDataBytes = content;
        const size = fileDataBytes.byteLength;
        await this.writer.write(fileDataBytes);
        return size;
    }

    writeUint32(view, offset, value) {
        view.setUint32(offset, value, true);
    }

    writeUint16(view, offset, value) {
        view.setUint16(offset, value, true);
    }
}

export default Zipper