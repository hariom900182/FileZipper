# File Zipper

## Introduction
Zipper.js implementation is to create zip file at file path selected with **showSaveFilePicker** and append multiple files to it, it does not use RAM or browser memory for zip file contents

## How to use

### Step 1
import Zipper from packages
```
import Zipper from "./packages/zipper";
```

### Step 2
* Create Zipper object it requires two parameters
    - Zip file name
    - Description
```
await zipper.create("sample.zip", "sample")
```

### Step 3 - 1 (Full file content at once) 
Writes file(s) to zipper object

```
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const name = file.name;
        const uint8FileData = await file.arrayBuffer();
        await zipper.writeFile(name, uint8FileData);
    }
```
### Step 3 - 2 (Writing file and adding chunks into it)
Example code: Writes file(s) to zipper object 

```
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const size = file.size;
        const arr = calcuateSliceArray(size);
        const name = file.name;
        if (arr.length == 1) {
            statusMsg.innerHTML = "Adding: file: " + name;
        }
        for (let i = 0; i < arr.length; i++) {
            statusMsg.innerHTML = "Adding: " + name + " > Chunk (" + (i + 1) + "/" + arr.length + ")";
            const blob = file.slice(arr[i].start, arr[i].end);
            const buffer = await blob.arrayBuffer();
            const uint8View = new Uint8Array(buffer);
            if (i == 0) {
                await zipper.writeFile(name, uint8View, new Date());
                continue;
            }
            await zipper.appendToFile(uint8View)  <-- append content to current file
        }
    }
```

hed
### Step 4

Once all files are written make it done as below

```
await zipper.done();
```


# Example

## Code
Html file:  index.html and script: index.js

## How to run

* Follow the below steps to run example

- Install npm dependencies using below command

```
npm install
```
- Run application
```
npm run dev
```
