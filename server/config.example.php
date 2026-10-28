<?php
// Copy outside the public website directory; do not put real credentials in Git.
return [
 'db_host'=>'localhost','db_port'=>3306,'db_name'=>'your_database','db_user'=>'your_database_user','db_password'=>'',
 'allowed_origins'=>['https://your-domain.example','https://stisvladnext3-creator.github.io'],
 'frontend_url'=>'https://your-domain.example/',
 'secret'=>'GENERATE_A_RANDOM_64_CHARACTER_SECRET',
 'storage_dir'=>__DIR__.'/.private/files',
 'environment'=>'production',
 'require_email_verification'=>false,
 // 'mail' uses the hosting's configured PHP mail service. Do not use a Gmail
 // password here. Set a sender at your own domain with the hosting provider.
 'mail_mode'=>'none','mail_from'=>'noreply@your-domain.example',
];
