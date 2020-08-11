// First argument the user credentials
// Second optional argument discography relative file path


const axios = require('axios').default;
const querystring = require('querystring');
const fs = require('fs');
require('dotenv').config();

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const TRELLO_BASE_URL = 'https://api.trello.com/1/';

const TRELLO_USER_TOKEN = process.argv[2] || process.env.TRELLO_USER_TOKEN;

async function get(url, params, headers, identifier) {
  let response;
  try {
    response = await axios.get(url, {
      params: params,
      headers: headers,
     }).catch(function (error) {
      console.log(`Request error on getting ${identifier}: ${error}`)
     });
  } catch (err) {
    console.log(`Application error on getting ${identifier}: ${err}`);
  };
  return response;
}

async function trello_post(resource, params, identifier) {
  let response;
  try {
    response = await axios.post(`${TRELLO_BASE_URL}${resource}`, {},
      {
        params: {
          ...params,
          key: process.env.TRELLO_API_KEY,
          token: TRELLO_USER_TOKEN,
        },
      }).catch(function (error) {
        console.log(`Request error on ${identifier} on trello : ${error}`)
      });
  } catch (err) {
    console.log(`Application error on ${identifier} on trello: ${err}`);
  }
  return response;
};

function discography_sorter(a, b) {
  if (a.year != b.year) {
    return (a.year - b.year);
  } else {
    if (a.name < b.name) {return -1;}
    if (a.name > b.name) {return 1;}
    return 0;
  }
};

async function main() {
  console.log('Starting...');
  const file_path = process.argv[3] || './discography.txt';

  console.log('Processing file...');

  let discography = fs.readFileSync(file_path, 'utf8').split('\n');

  discography.pop();

  discography = discography.map((disk) => {
    const new_element = disk.match(/^(\d*) (.*)$/).slice(1, 3);
    return {
      year: new_element[0],
      name: new_element[1],
    }
  }).sort(discography_sorter);

  let discography_by_decade = [{}];

  discography_by_decade[0][discography[0].year.substring(0, 3)] = [];
  discography.forEach((disk) => {
    const current_decade = disk.year.substring(0, 3);
    if ( Object.keys(discography_by_decade[discography_by_decade.length - 1])[0] === current_decade) {
      discography_by_decade[discography_by_decade.length - 1][current_decade].push(disk)
    } else {
      discography_by_decade.push({});

      discography_by_decade[discography_by_decade.length - 1][current_decade] = [disk];
    }
  });

  console.log('Obtaining access to spotify...');

  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  const encoded = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  // Get the token from spotify
  let response;
  try {
    response = await axios.post(SPOTIFY_TOKEN_URL,
      querystring.stringify({'grant_type':'client_credentials'}),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encoded}`,
        },
      }).catch(function (error) {
        console.log(`Request error on getting token to spotify: ${error}`);
      });
  } catch (err) {
    console.log(`Application error on getting token to spotify: ${err}`);
  }
  const spotify_token = response.data.access_token;

  console.log('Creating board on Trello...');
  const board_id = (await trello_post(
    'boards', {
      name: "Bob Dylan's discography",
      defaultLists: false,
    },
    'creating board',
  )).data.id;

  // Using for loop instead of forEach so await works inside the loop
  let images_by_decade_index = 0;
  for (const decade of discography_by_decade) {
    const year = Object.keys(decade)[0];
    const list_id = (await trello_post(
      'lists', {
        name: `${year}0`,
        idBoard: board_id,
        pos: 'bottom',
      },
      `creating list for ${year}`,
    )).data.id;

    for (let decade_index = 0; decade_index < decade[year].length; decade_index++) {
      const disk = decade[year][decade_index];
      const card_id = (await trello_post(
        'cards', {
          name: `${disk.year} - ${disk.name}`,
          idList: list_id,
        },
        `creating card for ${disk.name}`,
      )).data.id;

      const album_from_spotify = (await get(
        SPOTIFY_SEARCH_URL, {
          q: `album:${disk.name} artist:Bob Dylan`,
          type: 'album',
          limit: 1,
        }, {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${spotify_token}`,
        },
        'cover art from spotify',
      )).data.albums.items;

      if (album_from_spotify.length > 0) {
        trello_post(
          `cards/${card_id}/attachments`, {
            url: album_from_spotify[0].images[0].url,
            setCover: true,
          },
          `creating attachment for ${disk.name}`,
        );
      }
    };
  };
  console.log('Finished!');
};

main().catch(function(error) {
  console.log(`There was a error: ${error}`);
});
