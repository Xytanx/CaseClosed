const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();
const session = require('express-session');
const clientProfile = require("./models/client_profile.js");
const advocateProfile = require("./models/advocate_profile.js");
const arbitratorProfile = require("./models/arbitrator_profile.js");
const documentWriterProfile = require("./models/document_writer_profile.js");
const mediatorProfile = require("./models/mediator_profile.js");
const notaryProfile = require("./models/notary_profile.js");
const Request = require('./models/requests'); 
const app = express();

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'your-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false // Change to true for production (HTTPS)
    }
}));

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connection successful");
    } catch (err) {
        console.error("MongoDB connection error:", err);
    }
}

main();

// Client Routes
app.post("/client/new_client", async (req, res) => {
    const { username, first_name, last_name, phone_no, email_addr, age, aadhar_no, password } = req.body;

    try {
        // Check if the username already exists
        const existingClient = await clientProfile.findOne({ username });
        if (existingClient) {
            return res.status(400).send("Username already exists"); // Or render an error page
        }

        // Create a new client document
        const newClient = new clientProfile({
            username,
            first_name,
            last_name,
            phone_no,
            email_addr,
            age,
            aadhar_no,
            password,
        });

        // Save the client to the database
        await newClient.save();
        console.log("Client saved:", newClient);

        // Log the client in by setting session variables
        req.session.userId = newClient._id;
        req.session.userRole = "client"; // Or whatever role you assign to clients

        // Redirect to the client profile page
        res.redirect("/client/profile");
    } catch (err) {
        console.error("Error saving client:", err);
        res.status(500).send("Error creating account. Please try again.");
    }
});

app.get("/client/edit_profile", async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client/login');
    }

    try {
        const r_client = await clientProfile.findById(req.session.userId);
        if (!r_client) {
            return res.redirect('/client/profile');
        }
        res.render("client_edit_profile.ejs", { session: req.session, r_client: r_client });
    } catch (error) {
        console.error("Error fetching client profile for edit:", error);
        res.redirect('/client/profile');
    }
});

app.post("/client/update_profile", async (req, res) => {
    const { userId, username, first_name, last_name, phone_no, email_addr, age, aadhar_no } = req.body;

    try {
        const updatedClient = await clientProfile.findByIdAndUpdate(
            userId,
            { username, first_name, last_name, phone_no, email_addr, age }, //Aadhar no is not included here.
            { new: true }
        );

        if (updatedClient) {
            res.redirect("/client/profile");
        } else {
            res.redirect("/client/profile");
        }
    } catch (error) {
        console.error("Error updating client profile:", error);
        res.redirect("/client/profile");
    }
});

app.get("/client/new_client", (req, res) => {
    res.render("new_client.ejs", { session: req.session });
});

app.get("/client", (req, res) => {
    res.render("client.ejs", { session: req.session, errorMessage: null });
});

app.post("/client/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const r_client = await clientProfile.findOne({ username });

        if (r_client && r_client.password === password) {
            req.session.userId = r_client._id;
            req.session.userRole = 'client';
            req.session.firstName = r_client.first_name; // Add firstName to session

            req.session.save((err) => {
                if (err) {
                    console.error("Error saving session:", err);
                    res.render("client.ejs", { errorMessage: "An error occurred during login.", session: req.session });
                    return; // Important: Exit to prevent further execution
                }
                res.redirect("/client/profile");
            });
        } else {
            res.render("client.ejs", { errorMessage: "Password is wrong", session: req.session });
        }
    } catch (error) {
        console.error("Error during client login:", error);
        res.render("client.ejs", { errorMessage: "An error occurred during login.", session: req.session });
    }
});

app.get("/client/profile", async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client');
    }

    try {
        const r_client = await clientProfile.findById(req.session.userId);

        if (!r_client) {
            return res.redirect('/client');
        }

        const requests = await Request.find({ clientId: req.session.userId })
            .sort({ createdAt: -1 });

        res.render("client_profile.ejs", { session: req.session, r_client: r_client, requests: requests });
    } catch (error) {
        console.error("Error fetching client profile:", error);
        res.redirect('/client');
    }
});

app.post("/send-request", async (req, res) => {
    // Session Validation Check
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client');
    }

    const { serviceProviderId, serviceProviderType, clientId, requestMessage } = req.body;

    if (!clientId) {
        return res.status(400).send("Client ID is missing.");
    }

    try {
        const r_client = await clientProfile.findById(clientId);
        const serviceProvider = await getProviderData(serviceProviderType, serviceProviderId);

        if (!r_client || !serviceProvider) {
            return res.status(400).send("client or service provider not found");
        }

        const newRequest = new Request({
            clientId,
            clientName: `${r_client.first_name} ${r_client.last_name}`,
            serviceProviderId,
            serviceProviderName: `${serviceProvider.first_name} ${serviceProvider.last_name}`,
            serviceProviderType,
            requestMessage,
        });

        await newRequest.save();

        // Redirect back to search-providers with a success message
        res.redirect(`/search-providers?serviceType=${serviceProviderType}&searchQuery=&message=Request Sent`);
    } catch (error) {
        console.error("Error sending request:", error);
        res.status(500).send("Error sending request. Please try again.");
    }
});

app.post("/update-request-state", async (req, res) => {
    const { requestId, action } = req.body;

    try {
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).send("Request not found.");
        }

        request.requestState = action === "accept" ? "accepted" : "rejected";
        await request.save();

        res.redirect("/service_provider/profile");
    } catch (error) {
        console.error("Error updating request state:", error);
        res.status(500).send("Error updating request state. Please try again.");
    }
});

app.post("/client/hire", async (req, res) => {
    // Session Validation Check
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client');
    }
    const { requestId } = req.body;

    try {
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).send("Request not found.");
        }

        request.hire = true;
        await request.save();

        res.redirect("/client/profile");
    } catch (error) {
        console.error("Error hiring service provider:", error);
        res.status(500).send("Error hiring service provider. Please try again.");
    }
});

app.post("/client/rate-review", async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client');
    }
    const { requestId, rating, review } = req.body;

    try {
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).send("Request not found.");
        }

        request.rating = rating;
        request.review = review;
        await request.save();

        // Calculate and update service provider's average rating
        const serviceProviderId = request.serviceProviderId;
        const serviceProviderType = request.serviceProviderType;

        const allRatings = await Request.find({
            serviceProviderId: serviceProviderId,
            rating: { $exists: true } // Only get requests with ratings
        });

        if (allRatings.length > 0) {
            const totalRatings = allRatings.reduce((sum, r) => sum + r.rating, 0);
            const averageRating = totalRatings / allRatings.length;

            // Update service provider's profile
            const updateData = { averageRating: averageRating };
            await updateProviderData(serviceProviderType, serviceProviderId, updateData);
        }

        res.redirect("/client/profile");
    } catch (error) {
        console.error("Error rating and reviewing:", error);
        res.status(500).send("Error rating and reviewing. Please try again.");
    }
});

app.post("/mark-completed", async (req, res) => {
    const { requestId } = req.body;

    try {
        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).send("Request not found.");
        }

        request.completed = true;
        await request.save();

        res.redirect("/service_provider/profile");
    } catch (error) {
        console.error("Error marking request as completed:", error);
        res.status(500).send("Error marking request as completed. Please try again.");
    }
});


app.get("/client/*", (req, res, next) => {
    if (req.path === '/client/login' || req.path === '/client/new_client') {
        return next();
    }
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client');
    }
    next();
});

// Service Provider Routes

app.get("/service_provider", (req, res) => {
    res.render("service_provider.ejs", { session: req.session });
});

app.get("/service_provider/new_service_provider", (req, res) => {
    res.render("new_service_provider.ejs", { session: req.session, errorMessage: null });
});

async function saveServiceProvider(Model, req, res, roleName) {
    const { username, first_name, last_name, phone_no, email_addr, age, aadhar_no, govt_verification_no, password } = req.body;

    try {
        const existingProvider = await Model.findOne({ username });
        if (existingProvider) {
            return res.status(400).send(`Username "${username}" is already taken for the ${roleName} role.`);
        }

        const newServiceProvider = new Model({ username, first_name, last_name, phone_no, email_addr, age, aadhar_no, govt_verification_no, password });
        await newServiceProvider.save();
        console.log(`Service provider (${roleName}) saved:`, newServiceProvider);

        // Log the user in
        req.session.userId = newServiceProvider._id;
        req.session.userRole = roleName;

        // Redirect to profile
        res.redirect("/service_provider/profile");

    } catch (err) {
        console.error(`Error saving service provider (${roleName}):`, err);
        res.status(500).send(`An error occurred while registering as ${roleName}. Please try again.`);
    }
}

app.get("/service_provider/login", (req, res) => {
    res.render("service_provider_login.ejs", { session: req.session, errorMessage: null }); // Initialize errorMessage here
});

// Service provider login improvement.
const serviceProviderModels = {
    'advocate': advocateProfile,
    'arbitrator': arbitratorProfile,
    'document_writer': documentWriterProfile,
    'mediator': mediatorProfile,
    'notary': notaryProfile
};

app.post("/service_provider/login", async (req, res) => {
    const { username, password, userRole } = req.body;

    try {
        const Model = serviceProviderModels[userRole];

        if (!Model) {
            return res.render("service_provider_login.ejs", { errorMessage: "Invalid user role", session: req.session });
        }

        const foundProvider = await Model.findOne({ username });

        if (!foundProvider) {
            return res.render("service_provider_login.ejs", { errorMessage: "User not found", session: req.session });
        }

        if (foundProvider.password === password) {
            req.session.userId = foundProvider._id;
            req.session.userRole = userRole;
            req.session.firstName = foundProvider.first_name; // Add firstName to session

            req.session.save((err) => {
                if (err) {
                    console.error("Error saving session:", err);
                    return res.render("service_provider_login.ejs", { errorMessage: "An error occurred during login.", session: req.session });
                }
                res.redirect("/service_provider/profile");
            });
        } else {
            return res.render("service_provider_login.ejs", { errorMessage: "Password wrong, please try again", session: req.session });
        }
    } catch (error) {
        console.error("Error during service provider login:", error);
        return res.render("service_provider_login.ejs", { errorMessage: "An error occurred during login.", session: req.session });
    }
});

// Reusable functions for profile handling
async function getProviderData(userRole, userId) {
    switch (userRole) {
        case 'advocate':
            return advocateProfile.findById(userId);
        case 'arbitrator':
            return arbitratorProfile.findById(userId);
        case 'document_writer':
            return documentWriterProfile.findById(userId);
        case 'mediator':
            return mediatorProfile.findById(userId);
        case 'notary':
            return notaryProfile.findById(userId);
        default:
            return null;
    }
}

async function updateProviderData(userRole, userId, updateData) {
    switch (userRole) {
        case 'advocate':
            return advocateProfile.findByIdAndUpdate(userId, updateData, { new: true });
        case 'arbitrator':
            return arbitratorProfile.findByIdAndUpdate(userId, updateData, { new: true });
        case 'document_writer':
            return documentWriterProfile.findByIdAndUpdate(userId, updateData, { new: true });
        case 'mediator':
            return mediatorProfile.findByIdAndUpdate(userId, updateData, { new: true });
        case 'notary':
            return notaryProfile.findByIdAndUpdate(userId, updateData, { new: true });
        default:
            return null;
    }
}

// Common Service Provider Profile Route
app.get("/service_provider/profile", async (req, res) => {
    if (!req.session.userId || !req.session.userRole) {
        return res.redirect("/service_provider/login");
    }

    try {
        const providerData = await getProviderData(req.session.userRole, req.session.userId);

        if (!providerData) {
            return res.redirect("/service_provider/login");
        }

        if (providerData.averageRating !== undefined && providerData.averageRating !== null) {
            providerData.averageRating = Number(providerData.averageRating);
        }

        // Fetch requests for the service provider with client name, sorted by timestamp
        const requests = await Request.find({ serviceProviderId: req.session.userId })
            .populate('clientId', 'first_name last_name')
            .sort({ timestamp: -1 }); // Sort by timestamp in descending order

        // Add client name to requests
        const requestsWithClientName = requests.map(request => {
            return {
                ...request.toObject(),
                clientName: request.clientId ? `${request.clientId.first_name} ${request.clientId.last_name}` : 'Unknown Client'
            };
        });

        // Add requests to providerData
        providerData.requests = requestsWithClientName;

        res.render("service_provider_profile.ejs", { provider: providerData, session: req.session });
    } catch (error) {
        console.error("Error fetching service provider profile:", error);
        res.redirect("/service_provider/login");
    }
});

app.get("/service_provider/edit_profile", async (req, res) => {
    if (!req.session.userId || !req.session.userRole) {
        return res.redirect("/service_provider/login");
    }

    try {
        const providerData = await getProviderData(req.session.userRole, req.session.userId);

        if (!providerData) {
            return res.redirect("/service_provider/login");
        }

        res.render("service_provider_edit.ejs", { provider: providerData, session: req.session });
    } catch (error) {
        console.error("Error fetching service provider profile for edit:", error);
        res.redirect("/service_provider/profile");
    }
});

app.post("/service_provider/update_profile", async (req, res) => {
    const { userId, username, first_name, last_name, email_addr, phone_no, age, aadhar_no, govt_verification_no } = req.body;

    try {
        let updateData = {
            username,
            first_name,
            last_name,
            email_addr,
            phone_no,
            age,
            aadhar_no,
        };

        if (govt_verification_no) {
            updateData.govt_verification_no = govt_verification_no;
        }

        const updatedProvider = await updateProviderData(req.session.userRole, userId, updateData);

        if (updatedProvider) {
            res.redirect("/service_provider/profile");
        } else {
            res.redirect("/service_provider/profile");
        }
    } catch (error) {
        console.error("Error updating service provider profile:", error);
        res.redirect("/service_provider/profile");
    }
});

app.get('/search-providers', async (req, res) => {
    if (!req.session.userId || req.session.userRole !== 'client') {
        return res.redirect('/client'); // Redirect to client login
    }
    const { serviceType, searchQuery = '' } = req.query; // Add default value for searchQuery

    try {
        let providers = [];
        if (serviceType === 'advocate') {
            providers = await advocateProfile.find({
                $or: [
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { first_name: { $regex: searchQuery, $options: 'i' } },
                    { last_name: { $regex: searchQuery, $options: 'i' } }
                ]
            });
        } else if (serviceType === 'arbitrator') {
            providers = await arbitratorProfile.find({
                $or: [
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { first_name: { $regex: searchQuery, $options: 'i' } },
                    { last_name: { $regex: searchQuery, $options: 'i' } }
                ]
            });
        } else if (serviceType === 'document_writer') {
            providers = await documentWriterProfile.find({
                $or: [
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { first_name: { $regex: searchQuery, $options: 'i' } },
                    { last_name: { $regex: searchQuery, $options: 'i' } }
                ]
            });
        } else if (serviceType === 'mediator') {
            providers = await mediatorProfile.find({
                $or: [
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { first_name: { $regex: searchQuery, $options: 'i' } },
                    { last_name: { $regex: searchQuery, $options: 'i' } }
                ]
            });
        } else if (serviceType === 'notary') {
            providers = await notaryProfile.find({
                $or: [
                    { username: { $regex: searchQuery, $options: 'i' } },
                    { first_name: { $regex: searchQuery, $options: 'i' } },
                    { last_name: { $regex: searchQuery, $options: 'i' } }
                ]
            });
        }

        res.render('search-providers', { providers, serviceType, searchQuery, session: req.session, req: req }); // Pass req here
    } catch (error) {
        console.error('Error searching providers:', error);
        res.status(500).send('Error searching providers');
    }
});

app.post("/service_provider/new_advocate", async (req, res) => {
    saveServiceProvider(advocateProfile, req, res, "advocate");
});

app.post("/service_provider/new_arbitrator", async (req, res) => {
    saveServiceProvider(arbitratorProfile, req, res, "arbitrator");
});

app.post("/service_provider/new_document_writer", async (req, res) => {
    saveServiceProvider(documentWriterProfile, req, res, "document_writer");
});

app.post("/service_provider/new_mediator", async (req, res) => {
    saveServiceProvider(mediatorProfile, req, res, "mediator");
});

app.post("/service_provider/new_notary", async (req, res) => {
    saveServiceProvider(notaryProfile, req, res, "notary");
});
// Home and Profile Routes
app.get("/", (req, res) => {
    res.render("home.ejs", { session: req.session });
});

app.get('/logout', (req, res) => {
    const userRole = req.session.userRole; // Get the user's role

    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }

        if (userRole === 'client') {
            res.redirect('/client'); // Redirect to client login
        } else {
            res.redirect('/service_provider/login'); // Redirect to service provider login
        }
    });
});
app.get("/logout-home", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        }
        res.redirect('/'); // Redirect to the home page after session destruction
    });
});

const port = 8080;
app.listen(port, () => {
    console.log(`Server is listening on port ${port}`);
});