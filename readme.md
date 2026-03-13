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
hed
### Step 4

Once all files are written make it done as below

```
await zipper.done();
```