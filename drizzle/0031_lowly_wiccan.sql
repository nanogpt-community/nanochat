CREATE TABLE `ssoProvider` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`oidcConfig` text,
	`samlConfig` text,
	`userId` text,
	`providerId` text NOT NULL,
	`organizationId` text,
	`domain` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ssoProvider_providerId_unique` ON `ssoProvider` (`providerId`);