// First argument the user credentials
// Second optional argument discography relative file path

const our_path = process.argv[1];
const credentials = process.argv[2];
const file_path = process.argv[3] || 'discography.txt';

fs = require('fs');

const discography_path = `${our_path.replace(/\/[^\/]*$/, '')}/${file_path}`;


let discography = fs.readFileSync(discography_path, 'utf8')

discography = discography.split('\n').filter((disk) => disk).map((disk) => (disk.match(/^(\d*) (.*)$/).slice(1, 3)))
