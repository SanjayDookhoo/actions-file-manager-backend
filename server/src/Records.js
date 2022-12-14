// TODO: memoize function calls, and store it in state, if calculated once, retrieve as is
export class Records {
	constructor(data) {
		this.data = data; // { files, folders, selectedFiles, selectedFolders }
	}

	getFolderPath(id) {
		const { folders } = this.data;
		const arr = [];
		let folderId = id;

		while (folderId) {
			const record = folders[folderId];
			arr.push(record);
			folderId = record.folderId;
		}
		return arr;
	}

	getFilePath(id) {
		const { files, folders } = this.data;
		const arr = [];
		let folderId = id;

		// file
		const record = files[folderId];
		arr.push(record);
		folderId = record.folderId;

		// search folders
		while (folderId) {
			const record = folders[folderId];
			arr.push(record);
			folderId = record.folderId;
		}
		return arr;
	}

	getFoldersPath() {
		const { selectedFolders } = this.data;
		const obj = {};

		selectedFolders.forEach((id) => {
			obj[id] = this.getFolderPath(id);
		});
		return obj;
	}

	getFilesPath() {
		const { selectedFiles } = this.data;
		const obj = {};

		selectedFiles.forEach((id) => {
			obj[id] = this.getFilePath(id);
		});
		return obj;
	}

	getFolder(id) {
		const { folders } = this.data;
		return folders[id];
	}

	getFile(id) {
		const { files } = this.data;
		return files[id];
	}

	getFolderRoot(id) {
		const path = this.getFolderPath(id);
		const length = path.length;
		return path[length - 1];
		// console.log(path);
		// return length == 1 ? path[0] : path[length - 1];
	}

	getFileRoot(id) {
		const path = this.getFilePath(id);
		const length = path.length;
		return path[length - 1];
		// return length == 1 ? path[0] : path[length - 1];
	}

	getFolderIdsAndSizes() {
		const { selectedFiles, selectedFolders } = this.data;
		const obj = {};

		selectedFiles.forEach((selectedFile) => {
			const { id } = this.getFilePath(selectedFile)[1];
			const { size } = this.getFile(selectedFile);
			if (id in obj) {
				obj[id] += size;
			} else {
				obj[id] = size;
			}
		});

		selectedFolders.forEach((selectedFolder) => {
			const { id } = this.getFolderPath(selectedFolder)[1];
			const { size } = this.getFolder(selectedFolder);
			if (id in obj) {
				obj[id] += size;
			} else {
				obj[id] = size;
			}
		});

		return obj;
	}

	addFolder(folder) {
		this.data.folders[folder.id] = folder;
	}
}
