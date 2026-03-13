import Zipper from "./packages/zipper";
console.log('Vite is running!');
const input = document.getElementById("file-selector")
const generateBtn = document.getElementById("generateBtn");
const clearBtn = document.getElementById("clearBtn");
const listContainer = document.getElementById("file-list");
listContainer.innerHTML = "No file selected";
const zipper = new Zipper();


input.addEventListener("change", (event) => {
    if (input.files.length == 0) {
        listContainer.innerHTML = "No file selected"
        return;
    }
    let table = "<table style='width: 100%;text-align:center;'><tr><th>Name</th><th>Type</th><th>Ext</th><th>Size</th></tr>";
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
        const name = file.name;
        const uint8FileData = await file.arrayBuffer();
        await zipper.writeFile(name, uint8FileData);
    }
    await zipper.done();
})


