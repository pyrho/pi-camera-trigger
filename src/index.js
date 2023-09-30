const Gpio = require('onoff').Gpio;
const axios = require('axios');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const downloadFromDslr = () => {
    return exec(`gphoto2 --capture-image-and-download --filename ./shots/${+new Date}.jpg`);
}

const downloadImage = async (imageUrl, outputPath) => {
  try {
    const response = await axios.get(imageUrl, { responseType: 'stream' });
    response.data.pipe(fs.createWriteStream(outputPath));

    return new Promise((resolve, reject) => {
      response.data.on('end', () => {
        resolve();
      });

      response.data.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    throw new Error(`Error downloading the image: ${error}`);
  }
};

// Example usage

function main() {

	const button = new Gpio(3, 'in', 'rising', {debounceTimeout: 10});

	button.watch((err, value) => {
		console.log('Button pressed yo!' + value)

		const imageUrl = 'http://mk4-spy:8080/snapshot?max_delay=0'; // Replace with your temporary image URL
		const outputPath = `shots/${+new Date()}.jpg`; // Replace with your desired output path

downloadFromDslr()
		//downloadImage(imageUrl, outputPath)
			.then(() => {
				console.log('Image downloaded successfully!');
			})
			.catch((error) => {
				console.error('Error downloading the image:', error);
			});
	});
	// Cleanup
	process.on('SIGINT', _ => {
		button.unexport();
	});

	console.log('Daemon running');
}

main()
