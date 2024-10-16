require('dotenv').config();
const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const crypto = require('crypto');
const fs = require("fs");
const nodemailer = require('nodemailer');
const { error } = require("console");
const session = require('express-session'); 

const secret = crypto.randomBytes(64).toString('hex'); // Generates a random 64-byte secret

const app = express();
app.use(cors({
    origin: [process.env.siteurl, process.env.adminurl],  // Replace with your frontend domain
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true // Allow credentials like cookies, authorization headers
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer setup for handling file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folderName;

        if (req.originalUrl.includes('/add-tournament') || req.originalUrl.includes('/update-tournament')) {
            folderName = path.join(__dirname, 'uploads', 'tournament_logo');
        } else if (req.originalUrl.includes('/add-team') || req.originalUrl.includes('/update-team')) {
            if (file.fieldname === 'teamLogo') {
                folderName = path.join(__dirname, 'uploads', 'team_logo');
            } else if (file.fieldname === 'receipt') {
                folderName = path.join(__dirname, 'uploads', 'receipts');
            }
        } else if (req.originalUrl.includes('/add-player')) {
            folderName = path.join(__dirname, 'uploads', 'team_document');
        } else if (req.originalUrl.includes('/News') || req.originalUrl.includes('/UpdateNews')) {
            folderName = path.join(__dirname, 'uploads', 'News');
        } else {
            return cb(new Error('Invalid upload path'));
        }

        // Ensuring the folder exists or creating it
        fs.mkdir(folderName, { recursive: true }, (err) => {
            if (err) {
                return cb(new Error('Failed to create upload directory'));
            } else {
                cb(null, folderName);
            }
        });
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});


const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    },
    limits: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, { fileSize: 100 * 1024 }); // 100KB for PDFs
        } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
            cb(null, { fileSize: 20 * 1024 }); // 20KB for images
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// MySQL connection
const db = mysql.createConnection({
    host: process.env.MYSQL_ADDON_HOST,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    port: process.env.MYSQL_ADDON_PORT || 3306 // Optional: Set a default if not provided
});



db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the database');
});
// Session middleware setup without a secret (not recommended)
app.use(session({
    secret: secret, // Set a secret key (change this to something more secure in production)
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Route to handle admin login
app.post('/login', (req, res) => {
    const { username, password } = req.body;


    const query = 'SELECT * FROM admin_login WHERE BINARY username = ? AND BINARY password = ?';
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }

        if (results.length > 0) {
            const id = results[0].id; // Assuming 'id' is a column in the 'admin_login' table
            const user = results[0].username; // Assuming 'username' is a column in the 'admin_login' table
            
            // Store user information in session
            req.session.user = { id, user };
            res.send({ message: 'Login successful', id, username: user });
        } else {
            res.send({ message: 'Invalid username or password' });
        }
    });
});

// // Route to handle admin login
// app.post('/login', (req, res) => {
//     const { username, password } = req.body;

//     const query = 'SELECT * FROM admin_login WHERE BINARY username = ? AND BINARY password = ?';
//     db.query(query, [username, password], (err, results) => {
//         if (err) {
//             console.error('Error querying the database:', err);
//             return res.status(500).send('Server error');
//         }

//         if (results.length > 0) {
//             const id = results[0].id; // Assuming 'id' is a column in the 'user' table
//             const user = results[0].username; // Assuming 'username' is a column in the 'user' table
//             req.session.user = { id, user };
//             res.send({ message: 'Login successful', id, username: user });
//         } else {
//             res.send({ message: 'Invalid username or password' });
//         }
//     });
// });


// Route to handle logout admin
app.post('/logout', (req, res) => {
    // Assuming you are using sessions
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'Logout successful' });
    });
});


// Route to handle adding a tournament
app.post('/add-tournament', upload.single('Logo'), (req, res) => {
    const { ageGroup, tournamentName, format, startDate, endDate, numberOfTeams, crickheros, sportlink } = req.body;
    const logo = req.file ? path.join('/uploads', 'tournament_logo', req.file.filename) : null;

    const query = 'INSERT INTO add_tournaments (age_group, name, format, start_date, end_date, number_of_teams, logo,CrickHeros,sportlink) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(query, [ageGroup, tournamentName, format, startDate, endDate, numberOfTeams, logo, crickheros, sportlink], (err, results) => {
        if (err) {
            console.error('Error inserting data into the database:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'Tournament added successfully' });
    });
});

// Route to get all tournaments
app.get('/get-tournaments', (req, res) => {
    const query = 'SELECT * FROM add_tournaments';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }
        res.send(results);
    });
});

// Route to get tournament names
app.get('/get-tournament-names', (req, res) => {
    const query = 'SELECT id, name FROM add_tournaments';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }
        res.send(results);
    });
});



// Route to handle deleting a tournament
app.delete('/delete-tournament/:id', (req, res) => {
    const { id } = req.params;

    const query = 'DELETE FROM add_tournaments WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error deleting data from the database:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'Tournament deleted successfully' });
    });
});

// Route to get a single tournament by ID
app.get('/get-tournament/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM add_tournaments WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }
        if (results.length > 0) {
            res.send(results[0]);
        } else {
            res.status(404).send('Tournament not found');
        }
    });
});

// Route to handle updating a tournament
app.put('/update-tournament/:id', upload.single('Logo'), (req, res) => {
    const { id } = req.params;
    const { ageGroup, tournamentName, format, startDate, endDate, numberOfTeams } = req.body;
    let logo = req.file ? path.join('/uploads/tournament_logo', req.file.filename) : null;

    const getCurrentLogoQuery = 'SELECT logo FROM add_tournaments WHERE id = ?';
    db.query(getCurrentLogoQuery, [id], (err, results) => {
        if (err) {
            console.error('Error fetching current logo:', err);
            return res.status(500).send('Server error');
        }

        // If no new logo uploaded, keep the old one
        if (!logo && results.length > 0) {
            logo = results[0].logo;
        }

        const updateQuery = `
            UPDATE add_tournaments
            SET age_group = ?, name = ?, format = ?, start_date = ?, end_date = ?, number_of_teams = ?, logo = ?
            WHERE id = ?
        `;
        db.query(updateQuery, [ageGroup, tournamentName, format, startDate, endDate, numberOfTeams, logo, id], (err, results) => {
            if (err) {
                console.error('Error updating data in the database:', err);
                return res.status(500).send('Server error');
            }
            res.send({ message: 'Tournament updated successfully' });
        });
    });
});



// Route to handle adding a team
app.post('/add-team', upload.fields([{ name: 'teamLogo', maxCount: 1 }, { name: 'receipt', maxCount: 1 }]), (req, res) => {
    const { teamName, clubname, captainName, contactNumber, email, aadhaarNumber, username, password, confirmPassword, receiptNumber } = req.body;
    const teamLogo = req.files.teamLogo ? path.join('/uploads', 'team_logo', req.files.teamLogo[0].filename) : null;
    let receiptImg = req.files.receipt ? path.join('/uploads', 'receipts', req.files.receipt[0].filename) : null;

    // Replace backslashes with forward slashes in receiptImg
    if (receiptImg) {
        receiptImg = receiptImg.replace(/\\/g, '/');
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password and Confirm Password do not match' });
    }

    // Generate a unique teamId
    const teamId = crypto.randomBytes(4).toString('hex');

    // Check if the username already exists
    const checkUsernameQuery = 'SELECT COUNT(*) AS count FROM user WHERE username = ?';
    db.query(checkUsernameQuery, [username], (err, results) => {
        if (err) {
            console.error('Error checking username:', err);
            return res.status(500).send('Server error');
        }

        if (results[0].count > 0) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Insert team data along with receipt number and image
        const insertTeamQuery = `
            INSERT INTO user 
            (teamId, team_name, clubname, team_logo, captain_name, contact_number, email, aadhaar_number, username, password, Recipt_Number, Recipt_img) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        db.query(insertTeamQuery, [teamId, teamName, clubname, teamLogo, captainName, contactNumber, email, aadhaarNumber, username, password, receiptNumber, receiptImg], (err) => {
            if (err) {
                console.error('Error inserting data into the database:', err);
                return res.status(500).send('Server error');
            }

            // Send email to the user with receipt URL embedded
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: `process.env.emailuser`,
                    pass: `process.env.emailpass` // Use environment variables for sensitive data
                }
            });

            mailOptions = {
                from: `process.env.emailfrom`,
                to: email,
                subject: 'Your Team Registration In Ndca Details',
                html: `
        <p>Hello ${captainName},</p>
        <p>Your team "<strong>${teamName}</strong>" has been successfully registered.</p>
        <p>Here are your login details:</p>
        <p>Username: <b>${username}</b></p>
        <p>Password: <b>${password}</b></p>
        <p>Best of luck!</p>
        ${receiptImg ? `<p>Here is your receipt:</p><a href=process.env.BASE_URL${receiptImg}" download="Receipt_${receiptImg.split('/').pop()}" style="max-width: 500px;" >Download Receipt</a>` : ''}
    `
            };


            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.error('Error sending email:', error);
                    return res.status(500).json({ message: 'Error sending email' });
                } else {
                    console.log('Email sent:', info.response);
                    return res.status(200).json({ message: 'Team added and email sent successfully' });
                }
            });
        });
    });
});




app.post('/update-team/:id', upload.single('teamLogo'), (req, res) => {
    const { id } = req.params;
    const { teamName, captainName, contactNumber, email, aadhaarNumber, username, password, confirmPassword } = req.body;
    let teamLogo = req.file ? path.join('/uploads', 'team_logo', req.file.filename) : null;

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Password and Confirm Password do not match' });
    }

    const getCurrentDataQuery = 'SELECT team_logo, username, password FROM user WHERE id = ?';
    db.query(getCurrentDataQuery, [id], (err, results) => {
        if (err) {
            console.error('Error fetching current team data:', err);
            return res.status(500).send('Server error');
        }

        const currentLogo = results[0].team_logo;
        const currentUsername = results[0].username;
        const currentPassword = results[0].password;

        // If no new logo uploaded, keep the old one
        if (!teamLogo && currentLogo) {
            teamLogo = currentLogo;
        }

        const updateQuery = `
          UPDATE user
          SET team_name = ?, team_logo = ?, captain_name = ?, contact_number = ?, email = ?, aadhaar_number = ?, username = ?, password = ?
          WHERE id = ?
      `;
        db.query(updateQuery, [teamName, teamLogo, captainName, contactNumber, email, aadhaarNumber, username, password, id], (err) => {
            if (err) {
                console.error('Error updating data in the database:', err);
                return res.status(500).send('Server error');
            }

            // Email functionality
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'process.env.emailuser',
                    pass: 'ljsecegqqlxmvkpp'
                }
            });

            let mailOptions = {
                from: 'process.env.emailuser',
                to: email,
                subject: 'Team Information Updated',
                html: `
                  <p>Hello ${captainName},</p>
                  <p>Your team "<strong>${teamName}</strong>" has been updated successfully.</p>
                  ${username !== currentUsername ? `<p>Username has been changed to: <b>${username}</b></p>` : ''}
                  ${password !== currentPassword ? `<p>Password has been changed.</p>` : ''}
                  <p>Best of luck in the tournament!</p>
              `
            };

            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log('Error Occurred: ' + error);
                } else {
                    console.log('Email sent to: ' + email + ', ' + info.response);
                }
            });

            res.send({ message: 'Team updated successfully' });
        });
    });
});
app.get('/api/tournaments/:id', (req, res) => {
    const tournamentId = req.params.id;
    // Fetch tournament from DB based on ID
    // Assuming you have a function getTournamentById that returns the tournament data
    const tournament = getTournamentById(tournamentId);

    if (tournament) {
        res.json({ logoUrl: tournament.logoUrl });
    } else {
        res.status(404).send('Tournament not found');
    }
});
// Route to get all teams
app.get('/get-teams', (req, res) => {
    const query = 'SELECT * FROM user';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }
        res.send(results);
    });
});

// Route to handle deleting a team
app.delete('/delete-team/:id', (req, res) => {
    const { id } = req.params;

    const query = 'DELETE FROM user WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error deleting data from the database:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'Team deleted successfully' });
    });
});

// Route to get a single team by ID
app.get('/get-team/:id', (req, res) => {
    const { id } = req.params;
    const query = 'SELECT * FROM user WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }
        if (results.length > 0) {
            res.send(results[0]);
        } else {
            res.status(404).send('Team not found');
        }
    });
});
// login for captain

app.post('/captain-login', (req, res) => {
    const { username, password } = req.body;

    // Exact match query to enforce case sensitivity
    const query = 'SELECT * FROM user WHERE BINARY username = ? AND BINARY password = ?';
    
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            return res.status(500).send('Server error');
        }

        if (results.length > 0) {
            const id = results[0].id; // Assuming 'id' is a column in the 'user' table
            const user = results[0].username; // Assuming 'username' is a column in the 'user' table
            
            res.send({ message: 'Login successful', id, username: user });
        } else  {
            // Invalid username or password (case-sensitive)
            res.send({ message: 'Invalid username or password' });
        }
    });
});




app.post('/add-player', upload.fields([{ name: 'adharupload', maxCount: 1 }, { name: 'Birth_certificate', maxCount: 1 }, { name: 'ssc_certificate', maxCount: 1 }, { name: 'school_lcertificate', maxCount: 1 }, { name: 'passport', maxCount: 1 }]), (req, res) => {
    const {
        teamId, adha_num, pfnmae, pmname, plnmae, gender, bloodGroup, email, mobile, permanentAddress, correspondenceAddress,
        dobCertNo, dobCertDate, dobCertPlace, schoolCertNo, sscCertDate, fatherName, motherName, guardianName,
        relationType, guardianAddress, emergencyContact, dob, age,  playerType, battingStyle,
        bowlingStyle, battingPosition, lastAssociation, lastYear, status
    } = req.body;

    // Check if the player's Aadhaar number already exists in the database
    const checkQuery = 'SELECT COUNT(*) AS count FROM player WHERE player_aadhar_no = ?';
    
    db.query(checkQuery, [adha_num], (err, result) => {
        if (err) {
            console.error('Error checking Aadhaar number:', err);
            return res.status(500).send('Server error');
        }
        
        if (result[0].count > 0) {
            // Aadhaar number already exists
            return res.status(400).send({ message: 'You are already registered in NDCA, please contact NDCA.' });
            // return res.send({ message: 'You are already registered in NDCA, please contact NDCA.' });
        }

        // Get the uploaded file paths
        const adharupload = req.files['adharupload'] ? path.join('/uploads', 'team_document', req.files['adharupload'][0].filename) : null;
        const Birth_certificate = req.files['Birth_certificate'] ? path.join('/uploads', 'team_document', req.files['Birth_certificate'][0].filename) : null;
        const ssc_certificate = req.files['ssc_certificate'] ? path.join('/uploads', 'team_document', req.files['ssc_certificate'][0].filename) : null;
        const school_lcertificate = req.files['school_lcertificate'] ? path.join('/uploads', 'team_document', req.files['school_lcertificate'][0].filename) : null;
        const passport = req.files['passport'] ? path.join('/uploads', 'team_document', req.files['passport'][0].filename) : null;

        // Insert the new player into the database
        const query = 'INSERT INTO player (teamId,player_aadhar_no, player_fname, player_mname, player_lname, player_gender, player_blood_group, player_email, player_mobile, player_per_addr, player_cor_addr, player_dob_cer_no, player_dob_cer_date, player_dob_cer_place, player_sch_cer_no, player_ssc_cer_date, player_father_name, player_mother_name, player_guard_name, player_relation, player_guard_addr, player_emerg_no, player_dob, player_age, playerType, battingStyle, bowlingStyle, battingPosition, lastAssociation, lastYear, adharupload, Birth_certificate,ssc_certificate,school_lcertificate,passport,status) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

        db.query(query, [
            teamId, adha_num, pfnmae, pmname, plnmae, gender, bloodGroup, email, mobile, permanentAddress, correspondenceAddress,
            dobCertNo, dobCertDate, dobCertPlace, schoolCertNo, sscCertDate, fatherName, motherName, guardianName,
            relationType, guardianAddress, emergencyContact, dob, age, playerType, battingStyle,
            bowlingStyle, battingPosition, lastAssociation, lastYear, adharupload, Birth_certificate, ssc_certificate, school_lcertificate, passport, status
        ], (err, results) => {
            if (err) {
                console.error('Error inserting data into the database:', err);
                return res.status(500).send('Server error');
            }
            res.send({ message: 'Player added successfully' });
        });
    });
});



app.put('/update-player/:id', (req, res) => {
    const { id } = req.params;
    const {
        adha_num,pfnmae,pmname,plnmae, gender,bloodGroup,email,mobile,permanentAddress, correspondenceAddress,dobCertNo,dobCertDate, dobCertPlace, schoolCertNo,sscCertDate, fatherName,motherName, guardianName, relationType,guardianAddress, emergencyContact,dob,age,playerType,battingStyle,bowlingStyle,battingPosition, lastAssociation,lastYear, status,
    } = req.body;

    const query = `
        UPDATE player SET
            player_aadhar_no = ?,
            player_fname = ?,
            player_mname = ?,
            player_lname = ?,
            player_gender = ?,
            player_blood_group = ?,
            player_email = ?,
            player_mobile = ?,
            player_per_addr = ?,
            player_cor_addr = ?,
            player_dob_cer_no = ?,
            player_dob_cer_date = ?,
            player_dob_cer_place = ?,
            player_sch_cer_no = ?,
            player_ssc_cer_date = ?,
            player_father_name = ?,
            player_mother_name = ?,
            player_guard_name = ?,
            player_relation = ?,
            player_guard_addr = ?,
            player_emerg_no = ?,
            player_dob = ?,
            player_age = ?,
          
            playerType = ?,
            battingStyle = ?,
            bowlingStyle = ?,
            battingPosition = ?,
            lastAssociation = ?,
            lastYear = ?,
            status = ?
        WHERE id = ?
    `;

    db.query(query, [
        adha_num,
        pfnmae,
        pmname,
        plnmae,
        gender,
        bloodGroup,
        email,
        mobile,
        permanentAddress,
        correspondenceAddress,
        dobCertNo,
        dobCertDate,
        dobCertPlace,
        schoolCertNo,
        sscCertDate,
        fatherName,
        motherName,
        guardianName,
        relationType,
        guardianAddress,
        emergencyContact,
        dob,
        age,
      
        playerType,
        battingStyle,
        bowlingStyle,
        battingPosition,
        lastAssociation,
        lastYear,
        status,
        id
    ], (err, results) => {
        if (err) {
            console.error('Error updating player data:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'Player updated successfully' });
    });
});





app.post('/News', upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
    { name: 'image3', maxCount: 1 }
]), (req, res) => {
    const { Headline, Description, publicationDate, category } = req.body; // Get publicationDate from req.body

    const image1 = req.files['image1'] ? path.join('/uploads', 'News', req.files['image1'][0].filename) : null;
    const image2 = req.files['image2'] ? path.join('/uploads', 'News', req.files['image2'][0].filename) : null;
    const image3 = req.files['image3'] ? path.join('/uploads', 'News', req.files['image3'][0].filename) : null;

    // Update query to include publicationDate
    const query = 'INSERT INTO news (Headline, Description, publicationDate,category, image1, image2, image3) VALUES (?,?,?,?,?,?,?)';
    db.query(query, [Headline, Description, publicationDate, category, image1, image2, image3], (err, results) => {
        if (err) {
            console.error('Error inserting data into the database:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'News added successfully' });
    });
});



app.get('/news', (req, res) => {
    const query = 'SELECT * FROM news';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching news data from the database:', err);
            return res.status(500).send('Server error');
        }
        res.json(results);
    });
});

app.get('/news/:id', (req, res) => {
    const { id } = req.params;  // Extract the ID from the URL
    const query = 'SELECT * FROM news WHERE id = ?';  // Query to fetch news by ID
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching news data from the database:', err);
            return res.status(500).send('Server error');
        }
        if (results.length === 0) {
            return res.status(404).send('News not found');  // Handle case where no news is found with the given ID
        }
        res.json(results[0]);  // Return the first result since ID is unique
    });
});

app.get('/news/:id', (req, res) => {
    const newsId = req.params.id;
    const query = 'SELECT * FROM news WHERE id = ?';
    db.query(query, [newsId], (err, results) => {
        if (err) {
            console.error('Error fetching news data from the database:', err);
            return res.status(500).send('Server error');
        }
        if (results.length === 0) {
            return res.status(404).send('News not found');
        }
        res.json(results[0]);
    });
});


app.post('/UpdateNews/:id', upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }, { name: 'image3', maxCount: 1 }]), (req, res) => {
    const { id } = req.params;
    const { Headline, Description, category } = req.body;

    const image1 = req.files['image1'] ? path.join('/uploads', 'News', req.files['image1'][0].filename) : null;
    const image2 = req.files['image2'] ? path.join('/uploads', 'News', req.files['image2'][0].filename) : null;
    const image3 = req.files['image3'] ? path.join('/uploads', 'News', req.files['image3'][0].filename) : null;

    let query = 'UPDATE news SET ';
    const fields = [];
    const values = [];

    if (Headline) {
        fields.push('Headline = ?');
        values.push(Headline);
    }

    if (Description) {
        fields.push('Description = ?');
        values.push(Description);
    } 
    if (category) {
        fields.push('category = ?');
        values.push(category);
    }

    if (image1) {
        fields.push('image1 = ?');
        values.push(image1);
    }

    if (image2) {
        fields.push('image2 = ?');
        values.push(image2);
    }

    if (image3) {
        fields.push('image3 = ?');
        values.push(image3);
    }

    if (fields.length === 0) {
        return res.status(400).send('No fields to update');
    }

    query += fields.join(', ') + ' WHERE id = ?';
    values.push(id);

    db.query(query, values, (err, results) => {
        if (err) {
            console.error('Error updating data in the database:', err);
            return res.status(500).send('Server error');
        }
        res.send({ message: 'News updated successfully' });
    });
});


app.delete('/News/:id', (req, res) => {
    const { id } = req.params; // Get the id from the request parameters

    const query = 'DELETE FROM news WHERE id = ?';
    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error deleting data from the database:', err);
            return res.status(500).send('Server error');
        }

        if (results.affectedRows === 0) {
            return res.status(404).send('News item not found');
        }

        res.send({ message: 'News item deleted successfully' });
    });
});







// checkbox logic

app.put('/update-player-status/:id', (req, res) => {
    const playerId = req.params.id;
    const { status } = req.body;

    const sql = 'UPDATE player SET status = ? WHERE id = ?';
    db.query(sql, [status, playerId], (err, result) => {
        if (err) throw err;
        res.json({ message: 'Player status updated successfully' });
    });
});

//show all the team inormaton

app.get('/api/players', (req, res) => {
    const query = 'SELECT * FROM player'; // Adjust the query if needed
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching players:', err);
            return res.status(500).send('Server error');
        }
        res.json(results);
    });
});

app.get('/Players-user/:teamId', (req, res) => {
    const teamId = req.params.teamId; // Extract teamId from the request parameters
    const query = 'SELECT * FROM player WHERE TeamId = ?'; // Query to fetch players by TeamId

    db.query(query, [teamId], (err, results) => {
        if (err) {
            console.error('Error fetching players:', err);
            return res.status(500).send('Server error');
        }
        res.json(results); // Return the results as JSON
    });
});


//delete team by id


app.delete('/delete-player/:id', (req, res) => {
    const playerId = req.params.id;

    const query = 'DELETE FROM player WHERE id = ?';

    db.query(query, [playerId], (err, results) => {
        if (err) {
            console.error('Error deleting player:', err);
            return res.status(500).send('Server error');
        }

        if (results.affectedRows === 0) {
            return res.status(404).send('Player not found');
        }

        res.send({ message: 'Player deleted successfully' });
    });
});

// Express route in your backend
app.get('/api-player/:id', (req, res) => {
    const playerId = req.params.id;
    const sql = `SELECT * FROM player WHERE id = ?`;

    db.query(sql, [playerId], (err, result) => {
        if (err) {
            return res.status(500).send(err);
        }
        if (result.length === 0) {
            return res.status(404).send({ message: 'Player not found' });
        }
        res.send(result[0]);
    });
});


// Backend route to enroll players in a tournament
app.post('/enroll-team', async (req, res) => {
    const { teamId, teamName, tournamentId, tournamentName, playerIds } = req.body;

    if (!teamId || !tournamentId || !playerIds || playerIds.length === 0) {
        return res.status(400).json({ message: "Missing required data" });
    }

    // Prepare the SQL query to insert multiple rows at once
    const values = playerIds.map(playerId => [playerId, teamId, teamName, tournamentId, tournamentName]);

    const query = `
    INSERT INTO tournament_team (playerid, teamId, teamName, tournamentId, tournamentName)
    VALUES ?
  `;

    try {
        // Execute the query, inserting all selected players at once
        await db.query(query, [values]);

        res.status(200).json({ message: "Players enrolled successfully!" });
    } catch (error) {
        console.error("Error enrolling players:", error);
        res.status(500).json({ message: "An error occurred while enrolling players." });
    }
});


app.get('/user-details/:playerid', async (req, res) => {
    const { playerid } = req.params;

    if (!playerid) {
        return res.status(400).json({ message: "Missing player ID" });
    }

    const query = `
    SELECT TournamentName, teamName FROM tournament_team
    WHERE playerid = ?
  `;

    try {
        db.query(query, [playerid], (error, results) => {
            if (error) {
                console.error("Error fetching team details:", error);
                return res.status(500).json({ message: "An error occurred while fetching team details." });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ message: "No data found for this player ID" });
            }

            // Return all tournament entries for the player
            res.status(200).json(results);
        });
    } catch (error) {
        console.error("Error fetching team details:", error);
        res.status(500).json({ message: "An error occurred while fetching team details." });
    }
});




app.get('/team-details/:tournamentid', async (req, res) => {
    const { tournamentid } = req.params;

    if (!tournamentid) {
        return res.status(400).json({ message: "Missing tournament ID" });
    }

    const query = `
    SELECT playerid, teamName ,TournamentName FROM tournament_team
    WHERE Tournamentid = ?
  `;

    try {
        db.query(query, [tournamentid], (error, results) => {
            if (error) {
                console.error("Error fetching team details:", error);
                return res.status(500).json({ message: "An error occurred while fetching team details." });
            }

            if (!results || results.length === 0) {
                return res.status(404).json({ message: "No data found for this tournament ID" });
            }

            // Return all player entries for the tournament
            res.status(200).json(results);
        });
    } catch (error) {
        console.error("Error fetching team details:", error);
        res.status(500).json({ message: "An error occurred while fetching team details." });
    }
});
// Start the server
const PORT = process.env.PORT1;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
