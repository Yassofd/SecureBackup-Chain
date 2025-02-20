
    document.addEventListener("DOMContentLoaded", function () {
        emailjs.init("8KvbwduEeaGic82sD"); // Remplace par ton User ID EmailJS

        document.getElementById("contact-form").addEventListener("submit", function (event) {
            event.preventDefault();

            const serviceID = "service_cpiqcv4"; // Remplace par ton Service ID
            const templateID = "template_i2j18oj"; // Remplace par ton Template ID

            const formData = {
                name: document.getElementById("name").value,
                email: document.getElementById("email").value,
                subject: document.getElementById("subject").value,
                message: document.getElementById("message").value
            };

            emailjs.send(serviceID, templateID, formData)
                .then(() => {
                    document.getElementById("sent-message").style.display = "block";
                    document.getElementById("contact-form").reset();
                })
                .catch((error) => {
                    alert("Erreur lors de l'envoi du message : " + error.text);
                });
        });
    });

