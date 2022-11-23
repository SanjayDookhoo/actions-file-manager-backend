import { v4 as uuidv4 } from 'uuid';
import { upload } from '../..';

const requestBatchUpload = async (req, res) => {
	const batchId = uuidv4();
	upload[batchId] = [];

	res.json({ batchId });
};

export default requestBatchUpload;
