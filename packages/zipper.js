import CRC32C from "crc-32";
//0 RAM usage, write directly to file system
class Zipper {
    options;
    handler;
    writer;
    nextHeaderOffset;
    currentHeaderOffset;
    currentHeaderSize;
    filelist;
    headerlist;
    cdhList;
    ecdr;
    cdrOffset;
    endOffset;
    crcSeed;
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
        this.endOffset = 0;
        this.nextHeaderOffset = 0;
        this.currentHeaderOffset = 0;
        this.currentHeaderSize = 0;
        this.initCRC32Seed();
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
    async writeFile(filename, content, lastModifiedDate) {
        this.initCRC32Seed();
        const headerSize = await this.writefileHeader(filename, content, lastModifiedDate);
        const filesize = await this.writefileContent(content);
        this.endOffset = this.endOffset + headerSize + filesize;
        this.filelist.push({
            filename: filename,
            size: filesize,
            headerOffset: this.nextHeaderOffset,
            headerSize: headerSize,
            lastModified: lastModifiedDate,
            crcValue: this.crcSeed
        });
        this.currentHeaderOffset = this.nextHeaderOffset;
        this.nextHeaderOffset = this.nextHeaderOffset + headerSize + filesize;
        this.cdrOffset = this.cdrOffset + headerSize + filesize;
    }

    async appendToFile(content) {
        const size = await this.writefileContent(content);
        this.endOffset = this.endOffset + size;
        const updatedSize = this.filelist[this.filelist.length - 1].size + size;
        this.filelist[this.filelist.length - 1].size = updatedSize //update the file size

        //update header
        const headerFileSizeOffset = this.filelist[this.filelist.length - 1].headerOffset + 14;
        await this.writer.seek(headerFileSizeOffset);

        //step 1: update crc value
        this.crcSeed = this.calculateCRC32(content, this.crcSeed);
        this.filelist[this.filelist.length - 1].crcValue = this.crcSeed //update the file crc

        const crcBuffer = new ArrayBuffer(4);
        const crcBufferView = new DataView(crcBuffer);
        this.writeUint32(crcBufferView, 0, this.crcSeed);
        const crcHeader = new Uint8Array(crcBuffer);
        await this.writer.write(crcHeader) //writer to file

        // Step 2: udpate file size    
        const headerbuffer = new ArrayBuffer(8);
        const headerbufferView = new DataView(headerbuffer);
        this.writeUint32(headerbufferView, 0, updatedSize);//compressed 
        this.writeUint32(headerbufferView, 4, updatedSize);//uncompressed

        const sizeHeader = new Uint8Array(headerbuffer);
        await this.writer.write(sizeHeader) //writer to file

        //at end move to last
        //const endOffset = this.filelist[this.filelist.length - 1].headerOffset + this.filelist[this.filelist.length - 1].headerSize + this.filelist[this.filelist.length - 1].size;
        await this.writer.seek(this.endOffset)

        //update next header offset
        this.nextHeaderOffset = this.nextHeaderOffset + size;

        //update cdrheader
        this.cdrOffset = this.cdrOffset + size
    }


    async done() {
        let size = 0;
        for (let i = 0; i < this.filelist.length; i++) {
            size = size + await this.writeFileCDR(this.filelist[i].filename, this.filelist[i].size, this.filelist[i].headerOffset, this.filelist[i].lastModified, this.filelist[i].crcValue);
            this.endOffset = this.endOffset + size;
        }
        await this.writeECDR(size, this.cdrOffset, this.filelist.length);
        await this.writer.close();
    }

    async writefileHeader(filename, content, modifiedOn) {
        //Zip header size: 30 + file name size in bytes
        const textEncoeder = new TextEncoder();
        const nameBytes = textEncoeder.encode(filename);
        const fileDataBytes = content;

        const sizeInBytes = fileDataBytes.byteLength; //same size of compressed and uncompressed (method 0 no compression)
        const fileHeaderSize = 30 + nameBytes.length;

        const fileHeaderBuffer = new ArrayBuffer(fileHeaderSize);
        const localHeaderView = new DataView(fileHeaderBuffer);

        //zip date tand time
        const dosFormatTm = this.getDosTime(modifiedOn);
        const dosFormatDt = this.getDosDate(modifiedOn);

        //calculate CRC
        this.crcSeed = this.calculateCRC32(content, this.crcSeed);

        this.writeUint32(localHeaderView, 0, 0x04034b50); //signature
        this.writeUint16(localHeaderView, 4, 20); //version
        this.writeUint16(localHeaderView, 6, 0); //general purpose flag
        this.writeUint16(localHeaderView, 8, 0); //compression method 0 = stored
        this.writeUint16(localHeaderView, 10, dosFormatTm); //modification time 
        this.writeUint16(localHeaderView, 12, dosFormatDt); //modification date
        this.writeUint32(localHeaderView, 14, this.crcSeed); //crc32 placeholder
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

    async writeFileCDR(filename, size, headerOffset, modifiedOn, crcValue) {
        //Zip CDR size: 46 + file name size in bytes
        const textEncoeder = new TextEncoder();
        const nameBytes = textEncoeder.encode(filename);

        //zip date tand time
        const dosFormatTm = this.getDosTime(modifiedOn);
        const dosFormatDt = this.getDosDate(modifiedOn);

        const sizeInBytes = size;//same size of compressed and uncompressed (method 0 no compression)
        const fileCDRHeaderSize = 46 + nameBytes.length;
        const fileCDRBuffer = new ArrayBuffer(fileCDRHeaderSize);
        const fileCDRHeaderView = new DataView(fileCDRBuffer);

        this.writeUint32(fileCDRHeaderView, 0, 0x02014b50); //CDFH signature
        this.writeUint16(fileCDRHeaderView, 4, 20); //version
        this.writeUint16(fileCDRHeaderView, 6, 20); //general purpose flag
        this.writeUint16(fileCDRHeaderView, 8, 0); //general purpose flag
        this.writeUint16(fileCDRHeaderView, 10, 0); //compression method 0 = stored
        this.writeUint16(fileCDRHeaderView, 12, dosFormatTm); //modification time 
        this.writeUint16(fileCDRHeaderView, 14, dosFormatDt); //modification date
        this.writeUint32(fileCDRHeaderView, 16, crcValue); //crc32 placeholder
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
        this.endOffset = this.endOffset + 22;
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

    //2 bytes dos format time
    //Bits 9-15 (7 bits): Years since 1980 (0-127).
    //Bits 5-8 (4 bits): Month (1-12)
    //Bits 0-4 (5 bits): Day (1-31)
    getDosTime(date) {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const dosTime = ((hours << 11) | (minutes << 5) | (Math.floor(seconds / 2)));
        return dosTime & 0xFFFF;
    }

    //2 bytes dos format date
    //Bits 11-15 (5 bits): Hours (0-23)
    //Bits 5-10 (6 bits): Minutes (0-59)
    //Bits 0-4 (5 bits): Seconds divided by 2
    getDosDate(date) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        if (year < 1980) return 0;
        const dosDate = (((year - 1980) << 9) | (month << 5) | day);
        return dosDate & 0xFFFF;
    }

    calculateCRC32(content, seed) {
        const crc = CRC32C.buf(content, seed);
        const unsignedCRC = (crc >>> 0)
        return unsignedCRC;
    }

    initCRC32Seed() {
        this.crcSeed = 0x00000000;
    }
}

export default Zipper