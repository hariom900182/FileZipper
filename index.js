import Zipper from "./packages/zipper";
console.log('Vite is running!');
const input = document.getElementById("file-selector")
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const listContainer = document.getElementById("file-list");
listContainer.innerHTML = "No file selected";
const statusMsg = document.getElementById("status-msg");
const zipper = new Zipper();

const MAX_WRITE_SIZE = 100000000; //100mb

input.addEventListener("change", (event) => {
    if (input.files.length == 0) {
        listContainer.innerHTML = "No file selected"
        return;
    }
    let table = "<table style='width: 100%;text-align:center;'><tr><th>Name</th><th>Type</th><th>Ext</th><th>Size(bytes)</th></tr>";
    for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        console.log(file.name);
        const name = file.name;
        const size = file.size;
        const type = file.type;
        const extension = name.split(".").pop();
        table = table + `<tr><td>${name}</td><td>${type}</td><td>${extension}</td><td>${size}</td></tr>`
    }
    table = table + "</table>"
    listContainer.innerHTML = table;
})

generateBtn.addEventListener("click", async () => {
    if (input.files.length == 0) {
        return;
    }

    await zipper.create("sample.zip", "sample")

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
            await zipper.appendToFile(uint8View)
        }
    }
    statusMsg.innerHTML = "Finalizing...";
    await zipper.done();


    input.value = null;
    listContainer.innerHTML = "";
    statusMsg.innerHTML = "Done";
})

function calcuateSliceArray(size) {
    let arr = [];
    let offset = 0;
    const itrs = Math.ceil(size / MAX_WRITE_SIZE)
    for (let i = 0; i < itrs; i++) {
        const nextSize = size <= MAX_WRITE_SIZE ? size : MAX_WRITE_SIZE;
        arr.push({ start: offset, end: offset + nextSize });
        offset = offset + nextSize;
        size = size - nextSize;
    }
    return arr;
}
