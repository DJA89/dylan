// First argument the user credentials
// Second optional argument discography relative file path

async function main() {
  const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const SPOTIFY_ALBUMS_URL = 'https://api.spotify.com/v1/albums';
  const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
  const SPOTIFY_ARTISTS_URL = 'https://api.spotify.com/v1/artists';

  const our_path = process.argv[1];
  const credentials = process.argv[2];
  const file_path = process.argv[3] || 'discography.txt';

  fs = require('fs');

  const discography_path = `${our_path.replace(/\/[^\/]*$/, '')}/${file_path}`;


  let discography = fs.readFileSync(discography_path, 'utf8')

  discography = discography.split('\n').filter((disk) => disk).map((disk) => (disk.match(/^(\d*) (.*)$/).slice(1, 3))).sort((a, b) => {
    if (a[0] != b[0]) {
      return (a[0] - b[0]);
    } else {
      if (a[1] < b[1]) {return -1;}
      if (a[1] > b[1]) {return 1;}
      return 0;
    }
  });

  require('dotenv').config();

  const client_id = process.env.CLIENT_ID;
  const client_secret = process.env.CLIENT_SECRET;
  const encoded = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  const axios = require('axios').default;
  const  querystring = require('querystring');


  // Get the token from spotify
  let response;
  try {
    response = await axios.post(SPOTIFY_TOKEN_URL,
         querystring.stringify({'grant_type':'client_credentials'}),
         {
           headers: {
             'Content-Type': 'application/x-www-form-urlencoded',
             'Authorization': `Basic ${encoded}`
           }
         }).catch(function (error) {
           console.log(`Request error on getting token to spotify: ${error}`)
         });
  } catch (err) {
    console.log(`Application error on getting token to spotify: ${err}`);
  }
//console.log(response.request);
  const spotify_token = response.data.access_token;

  // Get albums from spotify
  try {
    response = await axios.get(SPOTIFY_SEARCH_URL, {
        params: {
            q: 'bob dylan',
            type: 'artist',
            limit: 1,
        },
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${spotify_token}`
       }
     }).catch(function (error) {
       console.log(error.request);
       console.log(`Request error on getting artist from spotify: ${error}`)
     });
  } catch (err) {
    console.log(`Application error on getting artist from spotify: ${err}`);
  }

  const artist_id = response.data.artists.items[0].id;

  try {
    response = await axios.get(`${SPOTIFY_ARTISTS_URL}/${artist_id}/albums`, {
        params: {
            limit: 50,
        },
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${spotify_token}`
       }
     }).catch(function (error) {
       console.log(error.request);
       console.log(`Request error on getting albums from spotify: ${error}`)
     });
  } catch (err) {
    console.log(`Application error on getting albums from spotify: ${err}`);
  }

  const first_albums_images = response.data.items;

  try {
    response = await axios.get(`${SPOTIFY_ARTISTS_URL}/${artist_id}/albums`, {
        params: {
            limit: 50,
            offset: 50
        },
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${spotify_token}`
       }
     }).catch(function (error) {
       console.log(error.request);
       console.log(`Request error on getting albums from spotify: ${error}`)
     });
  } catch (err) {
    console.log(`Application error on getting albums from spotify: ${err}`);
  }

  const albums_images  = [...first_albums_images, ...response.data.items].map((disk) => ([disk.release_date.substring(0, 4), disk.name, disk.images])).sort((a, b) => {
    if (a[0] != b[0]) {
      return (a[0] - b[0]);
    } else {
      if (a[1] < b[1]) {return -1;}
      if (a[1] > b[1]) {return 1;}
      return 0;
    }
  });
  // Recorrer el segundo array y chequear si esta en el primeroi
  // console.log('From file');
  // console.log(discography.map((disk) => (`${disk[0]} - ${disk[1]}`)));
  // console.log('+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
  // console.log('From spotify');
  // console.log(albums_images.map((disk) => (`${disk[0]} - ${disk[1]}`)));
};

main().catch(function(error) {
  console.log(`There was a error: ${error}`);
});
