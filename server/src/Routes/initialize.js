import copy from './copy';
import paste from './paste';
import { getRecords } from '../getRecordsMiddleware';
import { demoFolderIdsToCopyInInitialize } from '../constants';

const initialize = async (req, res) => {
	const selectedFolders = demoFolderIdsToCopyInInitialize;
	const selectedFiles = [];

	res.locals.initialize = true;

	req.body.selectedFolders = selectedFolders;
	req.body.selectedFiles = selectedFiles;
	res.locals.records = await getRecords({
		selectedFiles,
		selectedFolders,
	});

	await copy(req, res);

	delete req.body.selectedFolders;
	delete req.body.selectedFiles;
	res.locals.records = await getRecords({
		selectedFiles: [],
		selectedFolders: [req.body.folderId],
	});
	await paste(req, res);

	res.json({ message: 'completed initializing' });
};

export default initialize;
