FROM php:8.3-apache
RUN docker-php-ext-install pdo_mysql
RUN mkdir -p /var/lib/memestone && chown www-data:www-data /var/lib/memestone
RUN printf '<Directory /var/www/html>\nAllowOverride All\n</Directory>\n' > /etc/apache2/conf-available/memestone.conf && a2enconf memestone
COPY api/ /var/www/html/api/
RUN chmod -R a+rX /var/www/html/api
EXPOSE 80
