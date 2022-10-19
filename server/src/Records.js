export class Records {
	constructor({ files, folders }) {
		this.files = files;
		this.folders = folders;

		// console.log(files, folders);
	}

	getFoldersPath() {
		return this.folders;
	}

	getFilesPath() {
		return this.files;
	}

	getFolderPath(id) {
		return this.folders[id];
	}

	getFilePath(id) {
		return this.files[id];
	}

	getFolder(id) {
		return this.folders[id][0];
	}

	getFile(id) {
		return this.files[id][0];
	}

	getFolderRoot(id) {
		const length = this.folders[id].length;
		return this.folders[id][length - 1];
	}

	getFileRoot(id) {
		const length = this.files[id].length;
		return this.files[id][length - 1];
	}
}
