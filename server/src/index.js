import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import remove from './Routes/remove.js';
import { graphqlHTTP } from 'express-graphql';
import schema from './graphql/Schemas/index.js';
import createNewFolder from './Routes/createNewFolder.js';
import search from './Routes/search.js';
import paste from './Routes/paste.js';
import copy from './Routes/copy.js';
import cut from './Routes/cut.js';
import downloadFile from './Routes/downloadFile.js';
import rename from './Routes/rename.js';
import http from 'http';
import getFolderName from './Routes/getFolderName.js';
import { webSocket } from './webSocket.js';
import restore from './Routes/restore.js';
import permanentlyDelete from './Routes/permanentlyDelete.js';
import permanentlyDeleteFile from './Routes/permanentlyDeleteFile.js';
import addSharedWithMe from './Routes/addSharedWithMe.js';
import getSharingLinks from './Routes/getSharingLinks.js';
import refreshSharingLink from './Routes/refreshSharingLink.js';
import { overrideConsole } from 'nodejs-better-console';
import { ownerCheck, userEditCheck, userViewCheck } from './userCheck.js';
import getRootUserFolder from './Routes/getRootUserFolder.js';
import 'express-async-errors'; // allows for a global level try catch https://stackoverflow.com/a/57527735/4224964
import { getRecordsMiddleware } from './getRecordsMiddleware.js';
import getTotalSize from './Routes/getTotalSize.js';
import startUpload from './Routes/fileUpload/startUpload.js';
import getUploadUrl from './Routes/fileUpload/getUploadUrl.js';
import completeUpload from './Routes/fileUpload/completeUpload.js';
import requestBatchUpload from './Routes/fileUpload/requestBatchUpload.js';
import completeBatchUpload from './Routes/fileUpload/completeBatchUpload.js';

overrideConsole();

const { SERVER_PORT } = process.env;

export const clipboard = {};
export const upload = {};

export const errorHandler = (err, req, res, next) => {
	const errors = err?.response?.errors;
	if (errors) {
		// if this is valid, then it is an error with hasura
		res.status(400).json({ errors });
	} else {
		console.log(err);
		res.status(500).json({ error: 'Unknown server error' });
	}
};

const app = express();
const server = http.createServer(app);
webSocket(server);

app.use(cors());
app.use(express.json());
app.use(
	'/graphql',
	graphqlHTTP({
		schema,
		// graphiql: true,
	})
); // https://www.youtube.com/watch?v=Dr2dDWzThK8

app.use(getRecordsMiddleware);

app.get('/requestBatchUpload', userEditCheck, requestBatchUpload);
app.get('/startUpload', startUpload);
app.get('/getUploadUrl', getUploadUrl);
app.post('/completeUpload', completeUpload);
app.post('/completeBatchUpload', completeBatchUpload);

app.post('/createNewFolder', userEditCheck, createNewFolder);
app.post('/cut', userEditCheck, cut);
app.post('/paste', userEditCheck, paste);
app.post('/rename', userEditCheck, rename);
app.post('/remove', userEditCheck, remove);
app.post('/search', userViewCheck, search);
app.post('/copy', userViewCheck, copy);
app.post('/downloadFile', userViewCheck, downloadFile);
app.post('/getFolderName', userViewCheck, getFolderName);
app.post('/getSharingLinks', userViewCheck, getSharingLinks); // check if owner inside function, and return both if so, otherwise just return view
app.post('/restore', ownerCheck, restore);
app.post('/permanentlyDelete', ownerCheck, permanentlyDelete);
app.post('/refreshSharingLink', ownerCheck, refreshSharingLink);

app.post('/permanentlyDeleteFile', permanentlyDeleteFile); // checking inside file for a secret header
app.post('/getRootUserFolder', getRootUserFolder);
app.post('/getTotalSize', ownerCheck, getTotalSize);

// shouldnt need a check
app.post('/addSharedWithMe', addSharedWithMe);

app.use(errorHandler);

server.listen(SERVER_PORT, () => {
	console.log(`Example app listening at http://localhost:${SERVER_PORT}`);
});
